import type { MiddlewareHandler } from 'hono';

// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const adminAuthMiddleware: MiddlewareHandler<any> = async (c, next) => {
  if (process.env.SKIP_AUTH === 'true') {
    return next();
  }

  const userId = c.get('userId') as string;
  const adminUserIds = process.env.ADMIN_USER_IDS ?? '';
  const allowedIds = adminUserIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!allowedIds.includes(userId)) {
    return c.json({ error: 'Forbidden.' }, 403);
  }

  return next();
};
