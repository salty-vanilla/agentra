import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bedrock kb structured config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('resolves safe defaults when env is unset', async () => {
    const { resolveBedrockKbStructuredRuntimeConfig, isBedrockKbStructuredLiveReady } =
      await import('../../rag/bedrock-kb-structured-config.js');

    const config = resolveBedrockKbStructuredRuntimeConfig({});

    expect(config).toMatchObject({
      knowledgeBaseId: undefined,
      region: 'us-east-1',
      dataSourceName: undefined,
      mode: 'stub',
      liveEnabled: false,
      redshiftServerlessWorkgroupName: undefined,
      redshiftDatabaseName: undefined,
    });
    expect(isBedrockKbStructuredLiveReady(config)).toBe(false);
  });

  it('resolves live mode and blockers from env', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_ID', 'kb-123');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_REGION', 'ap-northeast-1');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME', 'structured-facts');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'live');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'true');
    vi.stubEnv('REDSHIFT_SERVERLESS_WORKGROUP_NAME', 'workgroup-a');
    vi.stubEnv('REDSHIFT_DATABASE_NAME', 'warehouse');

    const {
      describeBedrockKbStructuredLiveBlocker,
      isBedrockKbStructuredLiveReady,
      resolveBedrockKbStructuredRuntimeConfig,
    } = await import('../../rag/bedrock-kb-structured-config.js');

    const config = resolveBedrockKbStructuredRuntimeConfig();

    expect(config).toMatchObject({
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      mode: 'live',
      liveEnabled: true,
      redshiftServerlessWorkgroupName: 'workgroup-a',
      redshiftDatabaseName: 'warehouse',
    });
    expect(isBedrockKbStructuredLiveReady(config)).toBe(true);
    expect(describeBedrockKbStructuredLiveBlocker(config)).toBeUndefined();
  });

  it('describes missing live requirements when live mode is requested', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'live');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'true');

    const {
      describeBedrockKbStructuredLiveBlocker,
      resolveBedrockKbStructuredRuntimeConfig,
    } = await import('../../rag/bedrock-kb-structured-config.js');

    const config = resolveBedrockKbStructuredRuntimeConfig();

    expect(describeBedrockKbStructuredLiveBlocker(config)).toContain(
      'BEDROCK_KB_STRUCTURED_ID',
    );
  });

  it('keeps live execution disabled unless the explicit flag is true', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'live');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'false');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_ID', 'kb-123');
    vi.stubEnv('REDSHIFT_SERVERLESS_WORKGROUP_NAME', 'workgroup-a');
    vi.stubEnv('REDSHIFT_DATABASE_NAME', 'warehouse');

    const {
      describeBedrockKbStructuredLiveBlocker,
      isBedrockKbStructuredLiveReady,
      resolveBedrockKbStructuredRuntimeConfig,
    } = await import('../../rag/bedrock-kb-structured-config.js');

    const config = resolveBedrockKbStructuredRuntimeConfig();

    expect(config.liveEnabled).toBe(false);
    expect(isBedrockKbStructuredLiveReady(config)).toBe(false);
    expect(describeBedrockKbStructuredLiveBlocker(config)).toBe(
      'Bedrock KB structured live execution is disabled.',
    );
  });
});
