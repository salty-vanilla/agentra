import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMiddleware, validateCognitoAccessTokenClaims } from '../middleware/auth.js';

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
      groups: [],
    });
  });

  it('forwards cognito:groups when present in token', () => {
    process.env.COGNITO_USER_POOL_CLIENT_ID = 'client-123';

    expect(
      validateCognitoAccessTokenClaims({
        sub: 'user-123',
        email: 'user@example.com',
        token_use: 'access',
        client_id: 'client-123',
        'cognito:groups': ['agentra-admin', 'editors'],
      }),
    ).toEqual({
      sub: 'user-123',
      email: 'user@example.com',
      groups: ['agentra-admin', 'editors'],
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

describe('authMiddleware - auth bypass gating', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  type MockContext = {
    set: ReturnType<typeof vi.fn>;
    req: { header: ReturnType<typeof vi.fn> };
  };

  it('rejects SKIP_AUTH=true when STORE_TYPE=dynamo (production mode)', async () => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'dynamo';

    const context: MockContext = {
      set: vi.fn(),
      req: { header: vi.fn(() => undefined) },
    };
    const next = vi.fn();

    await expect(authMiddleware(context as never, next)).rejects.toThrow(
      /Authentication bypass.*not allowed with DynamoDB storage/,
    );
  });

  it('allows SKIP_AUTH=true when STORE_TYPE=memory (local dev)', async () => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';

    const context: MockContext = {
      set: vi.fn(),
      req: { header: vi.fn(() => undefined) },
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await authMiddleware(context as never, next);

    expect(context.set).toHaveBeenCalledWith('userId', 'user-demo-001');
    expect(context.set).toHaveBeenCalledWith('userGroups', []);
    expect(next).toHaveBeenCalled();
  });

  it('allows SKIP_AUTH=true when STORE_TYPE is unset (defaults to memory)', async () => {
    process.env.SKIP_AUTH = 'true';
    delete process.env.STORE_TYPE;

    const context: MockContext = {
      set: vi.fn(),
      req: { header: vi.fn(() => undefined) },
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await authMiddleware(context as never, next);

    expect(context.set).toHaveBeenCalledWith('userId', 'user-demo-001');
    expect(context.set).toHaveBeenCalledWith('userGroups', []);
    expect(next).toHaveBeenCalled();
  });
});
