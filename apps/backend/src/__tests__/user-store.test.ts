import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryUserStore, normalizeUserRecord } from '../store/user-store.js';

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
});
