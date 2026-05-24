import type { MiddlewareHandler } from 'hono';

// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const adminAuthMiddleware: MiddlewareHandler<any> = async (c, next) => {
  if (process.env.SKIP_AUTH === 'true') {
    return next();
  }

  const adminGroupName = process.env.ADMIN_GROUP_NAME ?? 'agentra-admin';
  const groups = c.get('userGroups') as string[] | undefined;

  if (!groups?.includes(adminGroupName)) {
    return c.json({ error: 'Forbidden.' }, 403);
  }

  return next();
};
