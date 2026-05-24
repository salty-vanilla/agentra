import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';

function makeApp(userId = 'user-001') {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId);
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
    process.env.ADMIN_USER_IDS = original.ADMIN_USER_IDS;
  });

  describe('SKIP_AUTH=true', () => {
    beforeEach(() => {
      process.env.SKIP_AUTH = 'true';
      delete process.env.ADMIN_USER_IDS;
    });

    it('passes any userId through when SKIP_AUTH is true', async () => {
      const res = await makeApp('any-user').request('/');
      expect(res.status).toBe(200);
    });
  });

  describe('SKIP_AUTH not set', () => {
    beforeEach(() => {
      delete process.env.SKIP_AUTH;
    });

    it('allows userId that is in ADMIN_USER_IDS', async () => {
      process.env.ADMIN_USER_IDS = 'user-001,user-002';
      const res = await makeApp('user-001').request('/');
      expect(res.status).toBe(200);
    });

    it('allows second userId in the list', async () => {
      process.env.ADMIN_USER_IDS = 'user-001,user-002';
      const res = await makeApp('user-002').request('/');
      expect(res.status).toBe(200);
    });

    it('returns 403 for userId not in ADMIN_USER_IDS', async () => {
      process.env.ADMIN_USER_IDS = 'user-001';
      const res = await makeApp('user-999').request('/');
      expect(res.status).toBe(403);
    });

    it('returns 403 when ADMIN_USER_IDS is not set', async () => {
      delete process.env.ADMIN_USER_IDS;
      const res = await makeApp('user-001').request('/');
      expect(res.status).toBe(403);
    });

    it('returns 403 when ADMIN_USER_IDS is empty string', async () => {
      process.env.ADMIN_USER_IDS = '';
      const res = await makeApp('user-001').request('/');
      expect(res.status).toBe(403);
    });

    it('handles whitespace around user IDs', async () => {
      process.env.ADMIN_USER_IDS = ' user-001 , user-002 ';
      const res = await makeApp('user-001').request('/');
      expect(res.status).toBe(200);
    });
  });
});
