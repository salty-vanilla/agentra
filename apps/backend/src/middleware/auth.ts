import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { userStore } from '../store/user-store.js';

// HonoEnv is defined in app.ts — this file only uses the c.set interface
// Cached across Lambda warm starts
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

const cognitoRegion =
  process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1';

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId)
      throw new Error('COGNITO_USER_POOL_ID environment variable is not set');

    const url = new URL(
      `https://cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
    );
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

function getExpectedUserPoolClientId(): string {
  const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;
  if (!clientId) {
    throw new Error('COGNITO_USER_POOL_CLIENT_ID environment variable is not set');
  }
  return clientId;
}

type CognitoTokenClaims = {
  sub?: string | undefined;
  email?: string | undefined;
  token_use?: string | undefined;
  client_id?: string | undefined;
  aud?: string | undefined;
};

export function validateCognitoAccessTokenClaims(payload: CognitoTokenClaims) {
  const expectedClientId = getExpectedUserPoolClientId();

  // Agentra accepts Cognito access tokens only; browser auth should forward the
  // access token that is bound to the configured app client.
  if (payload.token_use !== 'access') {
    throw new Error('Invalid Cognito token type.');
  }

  const clientBinding = payload.client_id ?? payload.aud;
  if (clientBinding !== expectedClientId) {
    throw new Error('Invalid Cognito client binding.');
  }

  if (!payload.sub) {
    throw new Error('Unauthorized.');
  }

  return {
    sub: payload.sub,
    email: payload.email ?? '',
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const authMiddleware: MiddlewareHandler<any> = async (c, next) => {
  // SKIP_AUTH=true allows local development without a real Cognito token
  // Must NOT be used with DynamoDB store in production
  if (process.env.SKIP_AUTH === 'true') {
    if (process.env.STORE_TYPE === 'dynamo') {
      throw new Error(
        'Authentication bypass (SKIP_AUTH=true) is not allowed with DynamoDB storage. ' +
          'Remove SKIP_AUTH or set STORE_TYPE=memory for local development only.',
      );
    }
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
      issuer: `https://cognito-idp.${cognitoRegion}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
    });

    const { sub, email } = validateCognitoAccessTokenClaims({
      sub: payload.sub,
      email: payload.email as string | undefined,
      token_use: payload.token_use as string | undefined,
      client_id: payload.client_id as string | undefined,
      aud: payload.aud as string | undefined,
    });

    const user = await userStore.getOrCreateUser(sub, email);
    c.set('userId', user.userId);
  } catch {
    return c.json({ error: 'Unauthorized.' }, 401);
  }

  return next();
};
