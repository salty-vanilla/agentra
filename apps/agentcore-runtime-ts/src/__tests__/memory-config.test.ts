import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('memory-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns disabled when AGENT_MEMORY_ENABLED is not set', async () => {
    vi.stubEnv('AGENT_MEMORY_ENABLED', '');
    // Re-import to get fresh config
    const { resolveMemoryConfig } = await import('../memory/memory-config.js');
    const config = resolveMemoryConfig();
    expect(config.enabled).toBe(false);
    expect(config.s3).toBeNull();
  });

  it('returns enabled with no S3 when bucket is not set', async () => {
    vi.stubEnv('AGENT_MEMORY_ENABLED', 'true');
    vi.stubEnv('AGENT_SESSION_S3_BUCKET', '');
    const mod = await import('../memory/memory-config.js');
    const config = mod.resolveMemoryConfig();
    expect(config.enabled).toBe(true);
    expect(config.s3).toBeNull();
  });

  it('returns enabled with S3 config when bucket is set', async () => {
    vi.stubEnv('AGENT_MEMORY_ENABLED', 'true');
    vi.stubEnv('AGENT_SESSION_S3_BUCKET', 'my-bucket');
    vi.stubEnv('AGENT_SESSION_S3_PREFIX', 'my-sessions');
    vi.stubEnv('AGENT_SESSION_S3_REGION', 'ap-northeast-1');
    const mod = await import('../memory/memory-config.js');
    const config = mod.resolveMemoryConfig();
    expect(config.enabled).toBe(true);
    expect(config.s3).toEqual({
      bucket: 'my-bucket',
      prefix: 'my-sessions',
      region: 'ap-northeast-1',
    });
  });

  it('uses default prefix and region when not specified', async () => {
    vi.stubEnv('AGENT_MEMORY_ENABLED', 'true');
    vi.stubEnv('AGENT_SESSION_S3_BUCKET', 'test-bucket');
    vi.stubEnv('AGENT_SESSION_S3_PREFIX', '');
    vi.stubEnv('AGENT_SESSION_S3_REGION', '');
    vi.stubEnv('AWS_REGION', 'us-west-2');
    const mod = await import('../memory/memory-config.js');
    const config = mod.resolveMemoryConfig();
    expect(config.s3?.prefix).toBe('sessions');
    expect(config.s3?.region).toBe('us-west-2');
  });
});
