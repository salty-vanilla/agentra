import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';

function makeApp(groups: string[] = []) {
  const app = new Hono<{ Variables: { userGroups: string[] } }>();
  app.use('*', async (c, next) => {
    c.set('userGroups', groups);
    return next();
  });
  app.use('*', adminAuthMiddleware);
  app.get('/', (c) => c.json({ ok: true }));
  return app;
}

describe('adminAuthMiddleware', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.SKIP_AUTH = original.SKIP_AUTH;
    process.env.ADMIN_GROUP_NAME = original.ADMIN_GROUP_NAME;
  });

  describe('SKIP_AUTH=true', () => {
    beforeEach(() => {
      process.env.SKIP_AUTH = 'true';
      delete process.env.ADMIN_GROUP_NAME;
    });

    it('passes through regardless of group membership', async () => {
      const res = await makeApp([]).request('/');
      expect(res.status).toBe(200);
    });
  });

  describe('SKIP_AUTH not set', () => {
    beforeEach(() => {
      delete process.env.SKIP_AUTH;
    });

    it('allows user in agentra-admin group (default group name)', async () => {
      delete process.env.ADMIN_GROUP_NAME;
      const res = await makeApp(['agentra-admin']).request('/');
      expect(res.status).toBe(200);
    });

    it('allows user in custom ADMIN_GROUP_NAME group', async () => {
      process.env.ADMIN_GROUP_NAME = 'custom-admins';
      const res = await makeApp(['custom-admins']).request('/');
      expect(res.status).toBe(200);
    });

    it('allows user in multiple groups when one matches', async () => {
      delete process.env.ADMIN_GROUP_NAME;
      const res = await makeApp(['users', 'agentra-admin', 'editors']).request('/');
      expect(res.status).toBe(200);
    });

    it('returns 403 when user has no groups', async () => {
      delete process.env.ADMIN_GROUP_NAME;
      const res = await makeApp([]).request('/');
      expect(res.status).toBe(403);
    });

    it('returns 403 when user is in wrong groups', async () => {
      delete process.env.ADMIN_GROUP_NAME;
      const res = await makeApp(['users', 'editors']).request('/');
      expect(res.status).toBe(403);
    });

    it('returns 403 when user is in default group but ADMIN_GROUP_NAME is custom', async () => {
      process.env.ADMIN_GROUP_NAME = 'custom-admins';
      const res = await makeApp(['agentra-admin']).request('/');
      expect(res.status).toBe(403);
    });
  });
});
