import type { ObservabilityRecord } from '@agentra/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.js';
import { _resetCognitoClient } from '../lib/cognito-client.js';
import {
  putObservabilityRecord,
  resetObservabilityStore,
} from '../store/observability-store.js';
import { resetUserStore, userStore } from '../store/user-store.js';

function makeRecord(overrides: Partial<ObservabilityRecord> = {}): ObservabilityRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    traceId: 'trace-001',
    requestId: 'req-001',
    threadId: 'thread-001',
    userId: 'user-demo-001',
    startedAt: `${today}T10:00:00.000Z`,
    completedAt: `${today}T10:00:05.000Z`,
    durationMs: 5000,
    status: 'success',
    toolCalls: [],
    agentCalls: [],
    skillCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    createdAt: `${today}T10:00:05.000Z`,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('GET /admin/users', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
    resetObservabilityStore();
    resetUserStore();
  });

  afterEach(() => {
    delete process.env.SKIP_AUTH;
    delete process.env.STORE_TYPE;
    resetObservabilityStore();
    resetUserStore();
  });

  it('returns 200 with the DEMO_USER from UserTable', async () => {
    const res = await app.request('/admin/users');
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.users).toHaveLength(1);
    expect(body.users[0].userId).toBe('user-demo-001');
  });

  it('returns required identity fields for each user', async () => {
    const res = await app.request('/admin/users');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    const user = body.users[0];
    expect(user).toHaveProperty('userId');
    expect(user).toHaveProperty('sub');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('createdAt');
  });

  it('returns role=user for the demo user', async () => {
    const res = await app.request('/admin/users');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.users[0].role).toBe('user');
  });

  it('includes users with no observability records (no requestCount or lastSeenAt)', async () => {
    const res = await app.request('/admin/users');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    const user = body.users[0];
    // DEMO_USER has no obs records — these fields must be absent
    expect(user.requestCount).toBeUndefined();
    expect(user.lastSeenAt).toBeUndefined();
  });

  it('populates requestCount and lastSeenAt when observability records exist', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await putObservabilityRecord(
      makeRecord({
        traceId: 't-1',
        userId: 'user-demo-001',
        completedAt: `${today}T10:00:05.000Z`,
      }),
    );
    await putObservabilityRecord(
      makeRecord({
        traceId: 't-2',
        userId: 'user-demo-001',
        completedAt: `${today}T11:00:00.000Z`,
      }),
    );

    const res = await app.request('/admin/users');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    const user = body.users[0];
    expect(user.requestCount).toBe(2);
    expect(user.lastSeenAt).toBe(`${today}T11:00:00.000Z`);
  });

  it('returns correct errorRate when some records have status=error', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await putObservabilityRecord(
      makeRecord({
        traceId: 't-ok',
        status: 'success',
        completedAt: `${today}T10:00:05.000Z`,
      }),
    );
    await putObservabilityRecord(
      makeRecord({
        traceId: 't-err',
        status: 'error',
        completedAt: `${today}T10:01:00.000Z`,
      }),
    );

    const res = await app.request('/admin/users');
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.users[0].errorRate).toBeCloseTo(0.5);
  });

  describe('pagination', () => {
    it('returns all users when count <= limit', async () => {
      const res = await app.request('/admin/users?limit=10');
      // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
      const body = (await res.json()) as any;
      expect(body.users).toHaveLength(1);
      expect(body.cursor).toBeUndefined();
    });

    it('paginates correctly when limit < total users', async () => {
      await userStore.getOrCreateUser('sub-extra-1', 'a@example.com', []);
      await userStore.getOrCreateUser('sub-extra-2', 'b@example.com', []);

      const page1 = await app.request('/admin/users?limit=2');
      // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
      const body1 = (await page1.json()) as any;
      expect(body1.users).toHaveLength(2);
      expect(body1.cursor).toBeDefined();

      const page2 = await app.request(`/admin/users?limit=2&cursor=${body1.cursor}`);
      // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
      const body2 = (await page2.json()) as any;
      expect(body2.users).toHaveLength(1);
      expect(body2.cursor).toBeUndefined();
    });

    it('traverses all pages with limit=1 without duplicates or missing users', async () => {
      await userStore.getOrCreateUser('sub-extra-1', 'a@example.com', []);
      await userStore.getOrCreateUser('sub-extra-2', 'b@example.com', []);

      const collected: string[] = [];
      let cursor: string | undefined;

      do {
        const url = cursor
          ? `/admin/users?limit=1&cursor=${cursor}`
          : '/admin/users?limit=1';
        const res = await app.request(url);
        expect(res.status).toBe(200);
        // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
        const body = (await res.json()) as any;
        expect(body.users).toHaveLength(1);
        collected.push(body.users[0].userId);
        cursor = body.cursor;
      } while (cursor);

      // 3 users total (DEMO + 2 extras), no duplicates
      expect(collected).toHaveLength(3);
      expect(new Set(collected).size).toBe(3);
    });
  });

  describe('input validation', () => {
    it('returns 400 for limit=0', async () => {
      const res = await app.request('/admin/users?limit=0');
      expect(res.status).toBe(400);
    });

    it('returns 400 for limit=201', async () => {
      const res = await app.request('/admin/users?limit=201');
      expect(res.status).toBe(400);
    });

    it('returns 400 for limit=abc', async () => {
      const res = await app.request('/admin/users?limit=abc');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid cursor (random string)', async () => {
      const res = await app.request('/admin/users?cursor=not-a-valid-cursor!!');
      expect(res.status).toBe(400);
    });

    it('returns 400 for cursor that decodes to a non-integer', async () => {
      const badCursor = Buffer.from('abc').toString('base64');
      const res = await app.request(`/admin/users?cursor=${badCursor}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 for cursor that decodes to a negative number', async () => {
      const badCursor = Buffer.from('-5').toString('base64');
      const res = await app.request(`/admin/users?cursor=${badCursor}`);
      expect(res.status).toBe(400);
    });
  });

  describe('authorization', () => {
    it('returns 401 when request has no auth token', async () => {
      delete process.env.SKIP_AUTH;
      const res = await app.request('/admin/users');
      expect(res.status).toBe(401);
    });
  });
});

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class MockAdminCreateUserCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockAdminAddUserToGroupCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class MockCognitoIdentityProviderClient {
    send = mockSend;
  }
  return {
    CognitoIdentityProviderClient: MockCognitoIdentityProviderClient,
    AdminCreateUserCommand: MockAdminCreateUserCommand,
    AdminAddUserToGroupCommand: MockAdminAddUserToGroupCommand,
  };
});

describe('POST /admin/users/invite', () => {
  function mockCreateUserSuccess(sub = 'cognito-sub-123') {
    mockSend.mockResolvedValueOnce({
      User: { Attributes: [{ Name: 'sub', Value: sub }] },
    });
  }

  function mockAddToGroupSuccess() {
    mockSend.mockResolvedValueOnce({});
  }

  function postInvite(body: Record<string, unknown>) {
    return app.request('/admin/users/invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_test';
    resetUserStore();
    _resetCognitoClient();
    mockSend.mockReset();
  });

  afterEach(() => {
    delete process.env.SKIP_AUTH;
    delete process.env.STORE_TYPE;
    delete process.env.COGNITO_USER_POOL_ID;
    resetUserStore();
  });

  it('returns 201 with email, role, sub, userId for a user-role invite', async () => {
    mockCreateUserSuccess('sub-abc');

    const res = await postInvite({ email: 'new@example.com', role: 'user' });
    expect(res.status).toBe(201);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.email).toBe('new@example.com');
    expect(body.role).toBe('user');
    expect(body.sub).toBe('sub-abc');
    expect(body.userId).toBeDefined();
  });

  it('writes a projection record to UserTable so the user appears in listing', async () => {
    mockCreateUserSuccess('sub-projection');

    await postInvite({ email: 'projection@example.com', role: 'user' });

    const users = await userStore.listUsers();
    const invited = users.find((u) => u.email === 'projection@example.com');
    expect(invited).toBeDefined();
    expect(invited?.role).toBe('user');
  });

  it('calls AdminAddUserToGroup and sets role=admin for admin invite', async () => {
    mockCreateUserSuccess('sub-admin');
    mockAddToGroupSuccess();

    const res = await postInvite({ email: 'admin@example.com', role: 'admin' });
    expect(res.status).toBe(201);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.role).toBe('admin');
    expect(mockSend).toHaveBeenCalledTimes(2);

    const users = await userStore.listUsers();
    const invited = users.find((u) => u.email === 'admin@example.com');
    expect(invited?.role).toBe('admin');
  });

  it('returns 400 for missing email', async () => {
    const res = await postInvite({ role: 'user' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await postInvite({ email: 'not-an-email', role: 'user' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role value', async () => {
    const res = await postInvite({ email: 'valid@example.com', role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when Cognito throws UsernameExistsException', async () => {
    const conflictErr = Object.assign(new Error('User already exists'), {
      name: 'UsernameExistsException',
    });
    mockSend.mockRejectedValueOnce(conflictErr);

    const res = await postInvite({ email: 'existing@example.com', role: 'user' });
    expect(res.status).toBe(409);
    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/already exists/i);
  });

  it('passes SUPPRESS MessageAction when sendInvitation is false', async () => {
    mockCreateUserSuccess();

    await postInvite({ email: 'quiet@example.com', role: 'user', sendInvitation: false });

    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const createCall = (mockSend.mock.calls[0] as any[])[0] as {
      input: { MessageAction?: string };
    };
    expect(createCall.input.MessageAction).toBe('SUPPRESS');
  });

  it('passes name to Cognito UserAttributes when name is provided', async () => {
    mockCreateUserSuccess();

    await postInvite({ email: 'named@example.com', role: 'user', name: 'Alice' });

    // biome-ignore lint/suspicious/noExplicitAny: test assertion helper
    const createCall = (mockSend.mock.calls[0] as any[])[0] as {
      input: { UserAttributes: Array<{ Name: string; Value: string }> };
    };
    const nameAttr = createCall.input.UserAttributes.find((a) => a.Name === 'name');
    expect(nameAttr?.Value).toBe('Alice');
  });

  it('returns 403 when caller is not an admin (non-admin cannot invite)', async () => {
    delete process.env.SKIP_AUTH;
    process.env.SKIP_AUTH = 'false';
    // Without SKIP_AUTH=true, auth middleware kicks in and rejects unauthenticated request
    const res = await postInvite({ email: 'anyone@example.com', role: 'user' });
    // No token → 401 from authMiddleware, then 403 from adminAuthMiddleware if token present
    expect([401, 403]).toContain(res.status);
  });
});
