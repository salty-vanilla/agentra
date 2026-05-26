import type { ObservabilityRecord } from '@agentra/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.js';
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
