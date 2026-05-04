import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('session-manager-factory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns noop when memory is disabled', async () => {
    vi.doMock('../memory/memory-config.js', () => ({
      resolveMemoryConfig: () => ({ enabled: false, s3: null }),
    }));

    const { createRuntimeSessionManager } = await import(
      '../memory/session-manager-factory.js'
    );
    const result = await createRuntimeSessionManager({
      userId: 'user-1',
      threadId: 'thread-1',
    });
    expect(result.mode).toBe('noop');
    expect(result.sessionManager).toBeUndefined();
  });

  it('returns noop when enabled but no S3 configured', async () => {
    vi.doMock('../memory/memory-config.js', () => ({
      resolveMemoryConfig: () => ({ enabled: true, s3: null }),
    }));

    const { createRuntimeSessionManager } = await import(
      '../memory/session-manager-factory.js'
    );
    const result = await createRuntimeSessionManager({
      userId: 'user-1',
      threadId: 'thread-1',
    });
    expect(result.mode).toBe('noop');
    expect(result.sessionManager).toBeUndefined();
  });

  it('creates S3-backed session manager when configured', async () => {
    vi.doMock('../memory/memory-config.js', () => ({
      resolveMemoryConfig: () => ({
        enabled: true,
        s3: { bucket: 'test-bucket', prefix: 'sessions', region: 'us-east-1' },
      }),
    }));

    const { createRuntimeSessionManager } = await import(
      '../memory/session-manager-factory.js'
    );
    const result = await createRuntimeSessionManager({
      userId: 'user-1',
      threadId: 'thread-1',
    });
    expect(result.mode).toBe('s3-session');
    expect(result.sessionManager).toBeDefined();
  });

  it('falls back to noop when S3Storage creation throws', async () => {
    vi.doMock('../memory/memory-config.js', () => ({
      resolveMemoryConfig: () => ({
        enabled: true,
        s3: { bucket: 'test-bucket', prefix: 'sessions', region: 'us-east-1' },
      }),
    }));
    vi.doMock('@strands-agents/sdk/session/s3-storage', () => {
      throw new Error('Module not found');
    });

    const { createRuntimeSessionManager } = await import(
      '../memory/session-manager-factory.js'
    );
    const result = await createRuntimeSessionManager({
      userId: 'user-1',
      threadId: 'thread-1',
    });
    expect(result.mode).toBe('noop');
    expect(result.sessionManager).toBeUndefined();
  });
});
