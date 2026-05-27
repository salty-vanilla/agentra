import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MemoryUserStore,
  normalizeUserRecord,
  shouldBackfillOrUpdateRole,
} from '../store/user-store.js';

describe('normalizeUserRecord', () => {
  it('passes through valid admin role', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'admin',
    });
    expect(result.role).toBe('admin');
  });

  it('passes through valid user role', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'user',
    });
    expect(result.role).toBe('user');
  });

  it('coerces missing role to user', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.role).toBe('user');
  });

  it('coerces invalid role value to user', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'superadmin',
    });
    expect(result.role).toBe('user');
  });
});

describe('shouldBackfillOrUpdateRole', () => {
  it('returns true when role is undefined (missing from DynamoDB)', () => {
    expect(shouldBackfillOrUpdateRole(undefined, 'user')).toBe(true);
  });

  it('returns true when role is an invalid value', () => {
    expect(shouldBackfillOrUpdateRole('superadmin', 'user')).toBe(true);
  });

  it('returns false when valid role matches derived role (user)', () => {
    expect(shouldBackfillOrUpdateRole('user', 'user')).toBe(false);
  });

  it('returns false when valid role matches derived role (admin)', () => {
    expect(shouldBackfillOrUpdateRole('admin', 'admin')).toBe(false);
  });

  it('returns true when valid role differs from derived role (user→admin)', () => {
    expect(shouldBackfillOrUpdateRole('user', 'admin')).toBe(true);
  });

  it('returns true when valid role differs from derived role (admin→user)', () => {
    expect(shouldBackfillOrUpdateRole('admin', 'user')).toBe(true);
  });
});

describe('MemoryUserStore', () => {
  let store: MemoryUserStore;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    store = new MemoryUserStore();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('assigns role=user when groups is empty', async () => {
    const user = await store.getOrCreateUser('sub-1', 'user@example.com', []);
    expect(user.role).toBe('user');
  });

  it('assigns role=admin when groups contains agentra-admin', async () => {
    const user = await store.getOrCreateUser('sub-2', 'admin@example.com', [
      'agentra-admin',
    ]);
    expect(user.role).toBe('admin');
  });

  it('uses ADMIN_GROUP_NAME env var for group check', async () => {
    process.env.ADMIN_GROUP_NAME = 'custom-admins';
    const user = await store.getOrCreateUser('sub-3', 'a@b.com', ['custom-admins']);
    expect(user.role).toBe('admin');
  });

  it('returns role=user when custom group name does not match', async () => {
    process.env.ADMIN_GROUP_NAME = 'custom-admins';
    const user = await store.getOrCreateUser('sub-4', 'a@b.com', ['agentra-admin']);
    expect(user.role).toBe('user');
  });

  it('updates role from user to admin on second login', async () => {
    await store.getOrCreateUser('sub-5', 'a@b.com', []);
    const updated = await store.getOrCreateUser('sub-5', 'a@b.com', ['agentra-admin']);
    expect(updated.role).toBe('admin');
  });

  it('updates role from admin to user on second login', async () => {
    await store.getOrCreateUser('sub-6', 'a@b.com', ['agentra-admin']);
    const updated = await store.getOrCreateUser('sub-6', 'a@b.com', []);
    expect(updated.role).toBe('user');
  });

  it('returns same record without write when role is already correct', async () => {
    const first = await store.getOrCreateUser('sub-7', 'a@b.com', ['agentra-admin']);
    const second = await store.getOrCreateUser('sub-7', 'a@b.com', ['agentra-admin']);
    expect(second.role).toBe('admin');
    expect(second.userId).toBe(first.userId);
  });

  it('listUsers returns all stored users including demo user', async () => {
    await store.getOrCreateUser('sub-8', 'x@example.com', []);
    const users = await store.listUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users.some((u) => u.sub === 'sub-8')).toBe(true);
  });

  it('listUsers returns demo user with role=user', async () => {
    const users = await store.listUsers();
    const demo = users.find((u) => u.sub === 'demo-sub');
    expect(demo?.role).toBe('user');
  });

  it('demo user has enabled=true', async () => {
    const users = await store.listUsers();
    const demo = users.find((u) => u.sub === 'demo-sub');
    expect(demo?.enabled).toBe(true);
  });

  it('getOrCreateUser new record has enabled=true', async () => {
    const user = await store.getOrCreateUser('sub-new', 'new@example.com', []);
    expect(user.enabled).toBe(true);
  });

  it('createInvitedUser has enabled=true', async () => {
    const record = await store.createInvitedUser('inv-sub', 'inv@example.com', 'user');
    expect(record.enabled).toBe(true);
  });

  it('getUserBySub returns the user when found', async () => {
    await store.getOrCreateUser('find-me', 'find@example.com', []);
    const found = await store.getUserBySub('find-me');
    expect(found).not.toBeNull();
    expect(found?.sub).toBe('find-me');
  });

  it('getUserBySub returns null for unknown sub', async () => {
    const found = await store.getUserBySub('does-not-exist');
    expect(found).toBeNull();
  });

  it('updateRole changes role immutably and returns updated record', async () => {
    const original = await store.getOrCreateUser('role-sub', 'r@example.com', []);
    expect(original.role).toBe('user');

    const updated = await store.updateRole('role-sub', 'admin');
    expect(updated.role).toBe('admin');
    expect(updated.userId).toBe(original.userId);

    // original object should not be mutated
    expect(original.role).toBe('user');
  });

  it('updateEnabled(false) sets enabled=false', async () => {
    await store.getOrCreateUser('en-sub', 'en@example.com', []);
    const updated = await store.updateEnabled('en-sub', false);
    expect(updated.enabled).toBe(false);

    const fetched = await store.getUserBySub('en-sub');
    expect(fetched?.enabled).toBe(false);
  });

  it('updateEnabled(true) sets enabled=true after disabling', async () => {
    await store.getOrCreateUser('en-sub2', 'en2@example.com', []);
    await store.updateEnabled('en-sub2', false);
    const updated = await store.updateEnabled('en-sub2', true);
    expect(updated.enabled).toBe(true);
  });
});

describe('normalizeUserRecord — enabled field', () => {
  it('treats missing enabled as true (backward compat)', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'user',
    });
    expect(result.enabled).toBe(true);
  });

  it('treats undefined enabled as true', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'user',
      enabled: undefined,
    });
    expect(result.enabled).toBe(true);
  });

  it('treats enabled=false as false', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'user',
      enabled: false,
    });
    expect(result.enabled).toBe(false);
  });

  it('treats enabled=true as true', () => {
    const result = normalizeUserRecord({
      userId: 'u1',
      sub: 's1',
      email: 'a@b.com',
      createdAt: '2026-01-01T00:00:00.000Z',
      role: 'user',
      enabled: true,
    });
    expect(result.enabled).toBe(true);
  });
});
