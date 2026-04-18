import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { userStore } from '../store/user-store.js';

// HonoEnv is defined in app.ts — this file only uses the c.set interface
// Cached across Lambda warm starts
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const region = process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1';
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new Error('COGNITO_USER_POOL_ID environment variable is not set');

    const url = new URL(
      `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
    );
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const authMiddleware: MiddlewareHandler<any> = async (c, next) => {
  // SKIP_AUTH=true allows local development without a real Cognito token
  if (process.env.SKIP_AUTH === 'true') {
    c.set('userId', 'user-demo-001');
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized.' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://cognito-idp.${process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
    });

    const sub = payload.sub;
    const email = (payload.email as string | undefined) ?? '';

    if (!sub) {
      return c.json({ error: 'Unauthorized.' }, 401);
    }

    const user = await userStore.getOrCreateUser(sub, email);
    c.set('userId', user.userId);
  } catch {
    return c.json({ error: 'Unauthorized.' }, 401);
  }

  return next();
};
