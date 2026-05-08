import { afterEach, describe, expect, it } from 'vitest';
import { validateCognitoAccessTokenClaims } from '../middleware/auth.js';

describe('validateCognitoAccessTokenClaims', () => {
  afterEach(() => {
    delete process.env.COGNITO_USER_POOL_CLIENT_ID;
  });

  it('accepts access tokens for the configured client', () => {
    process.env.COGNITO_USER_POOL_CLIENT_ID = 'client-123';

    expect(
      validateCognitoAccessTokenClaims({
        sub: 'user-123',
        email: 'user@example.com',
        token_use: 'access',
        client_id: 'client-123',
      }),
    ).toEqual({
      sub: 'user-123',
      email: 'user@example.com',
    });
  });

  it('rejects tokens issued for a different client', () => {
    process.env.COGNITO_USER_POOL_CLIENT_ID = 'client-123';

    expect(() =>
      validateCognitoAccessTokenClaims({
        sub: 'user-123',
        token_use: 'access',
        client_id: 'client-999',
      }),
    ).toThrow('Invalid Cognito client binding.');
  });

  it('rejects tokens with the wrong token type', () => {
    process.env.COGNITO_USER_POOL_CLIENT_ID = 'client-123';

    expect(() =>
      validateCognitoAccessTokenClaims({
        sub: 'user-123',
        token_use: 'id',
        aud: 'client-123',
      }),
    ).toThrow('Invalid Cognito token type.');
  });
});
