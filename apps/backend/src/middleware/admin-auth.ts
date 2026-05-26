import type { MiddlewareHandler } from 'hono';
import { getAdminGroupName } from '../lib/user-role.js';

// Authorization is based on Cognito group claim (userGroups), not UserTable.role.
// UserTable.role is display-only.
// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const adminAuthMiddleware: MiddlewareHandler<any> = async (c, next) => {
  if (process.env.SKIP_AUTH === 'true') {
    return next();
  }

  const groups = c.get('userGroups') as string[] | undefined;

  if (!groups?.includes(getAdminGroupName())) {
    return c.json({ error: 'Forbidden.' }, 403);
  }

  return next();
};
