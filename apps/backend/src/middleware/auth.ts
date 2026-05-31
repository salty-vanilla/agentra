import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { UserProfileClaims } from '../store/user-store.js';
import { userStore } from '../store/user-store.js';

// Header carrying the Cognito ID token. The access token authorizes the
// request; the ID token (verified separately) is the source of profile
// claims (email / name / preferred_username) for the UserTable projection.
export const ID_TOKEN_HEADER = 'x-id-token';

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

type CognitoAccessTokenClaims = {
  sub?: string | undefined;
  token_use?: string | undefined;
  client_id?: string | undefined;
  aud?: string | undefined;
  'cognito:groups'?: string[] | undefined;
};

// The access token authorizes the request: it establishes the caller's `sub`
// and group membership. Per Cognito's token model, identity/profile claims
// (email, name, preferred_username) belong to the ID token, not the access
// token, so they are intentionally NOT read here.
export function validateCognitoAccessTokenClaims(payload: CognitoAccessTokenClaims) {
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
    groups: payload['cognito:groups'] ?? [],
  };
}

type CognitoIdTokenClaims = {
  sub?: string | undefined;
  token_use?: string | undefined;
  aud?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
  preferred_username?: string | undefined;
};

// Validates a Cognito ID token used solely to project profile claims into the
// UserTable. The signature/issuer are checked by jwtVerify before this runs;
// here we enforce token_use === 'id' and the audience binding so a forged or
// mismatched token cannot inject profile data.
export function validateCognitoIdTokenClaims(payload: CognitoIdTokenClaims): {
  sub: string;
  email: string;
  profile: UserProfileClaims;
} {
  const expectedClientId = getExpectedUserPoolClientId();

  if (payload.token_use !== 'id') {
    throw new Error('Invalid Cognito ID token type.');
  }
  if (payload.aud !== expectedClientId) {
    throw new Error('Invalid Cognito ID token audience.');
  }
  if (!payload.sub) {
    throw new Error('Invalid Cognito ID token subject.');
  }

  return {
    sub: payload.sub,
    email: payload.email ?? '',
    profile: {
      name: payload.name,
      preferredUsername: payload.preferred_username,
    },
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
    c.set('userGroups', []);
    c.set('callerSub', 'demo-sub');
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

    const { sub, groups } = validateCognitoAccessTokenClaims({
      sub: payload.sub,
      token_use: payload.token_use as string | undefined,
      client_id: payload.client_id as string | undefined,
      aud: payload.aud as string | undefined,
      'cognito:groups': payload['cognito:groups'] as string[] | undefined,
    });

    // Profile projection (email / displayName) comes from the verified ID token
    // when the client forwards one. The access token alone never carries these
    // identity claims, so without an ID token we sync role only.
    let email = '';
    let profile: UserProfileClaims = {};
    const idToken = c.req.header(ID_TOKEN_HEADER);
    if (idToken) {
      const { payload: idPayload } = await jwtVerify(idToken, getJwks(), {
        issuer: `https://cognito-idp.${cognitoRegion}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
      });
      const idClaims = validateCognitoIdTokenClaims({
        sub: idPayload.sub,
        token_use: idPayload.token_use as string | undefined,
        aud: idPayload.aud as string | undefined,
        email: idPayload.email as string | undefined,
        name: idPayload.name as string | undefined,
        preferred_username: idPayload.preferred_username as string | undefined,
      });
      // The ID token must belong to the same authenticated user as the access
      // token; otherwise it is not a trustworthy source for this user's profile.
      if (idClaims.sub !== sub) {
        throw new Error('Cognito ID token subject does not match access token.');
      }
      email = idClaims.email;
      profile = idClaims.profile;
    }

    const user = await userStore.getOrCreateUser(sub, email, groups, profile);
    c.set('userId', user.userId);
    c.set('userGroups', groups);
    c.set('callerSub', sub);
  } catch {
    return c.json({ error: 'Unauthorized.' }, 401);
  }

  return next();
};
