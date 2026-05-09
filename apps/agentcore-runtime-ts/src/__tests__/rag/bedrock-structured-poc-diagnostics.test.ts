import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bedrock structured poc diagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reports safe warnings in stub mode and hides env values by default', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'stub');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_ID', '');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME', '');
    vi.stubEnv('REDSHIFT_SERVERLESS_WORKGROUP_NAME', '');
    vi.stubEnv('REDSHIFT_DATABASE_NAME', '');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'false');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_REGION', 'us-east-1');

    const { runBedrockStructuredPocDiagnostics } = await import(
      '../../rag/bedrock-structured-poc-diagnostics.js'
    );

    const output = await runBedrockStructuredPocDiagnostics();

    expect(output.status).toBe('warn');
    expect(output.summary).toContain('warning');
    expect(output.metadata).toMatchObject({
      diagnostics: 'bedrock-structured-poc-diagnostics-v1',
      mode: 'stub',
      liveEnabled: false,
    });
    expect(output.metadata).not.toHaveProperty('config');
    expect(output.checks.find((check) => check.id === 'knowledge_base_id')).toMatchObject(
      {
        status: 'warn',
      },
    );
  });

  it('includes safe config values when includeEnvValues is true', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'dry_run');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_ID', 'kb-123');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME', 'structured-source');
    vi.stubEnv('REDSHIFT_SERVERLESS_WORKGROUP_NAME', 'wg-1');
    vi.stubEnv('REDSHIFT_DATABASE_NAME', 'analytics');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'false');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_REGION', 'ap-northeast-1');

    const { runBedrockStructuredPocDiagnostics } = await import(
      '../../rag/bedrock-structured-poc-diagnostics.js'
    );

    const output = await runBedrockStructuredPocDiagnostics({
      includeEnvValues: true,
      metadata: {
        traceId: 'trace-1',
      },
    });

    expect(output.metadata).toMatchObject({
      diagnostics: 'bedrock-structured-poc-diagnostics-v1',
      traceId: 'trace-1',
      mode: 'dry_run',
      liveEnabled: false,
      config: {
        knowledgeBaseId: 'kb-123',
        region: 'ap-northeast-1',
        dataSourceName: 'structured-source',
        redshiftServerlessWorkgroupName: 'wg-1',
        redshiftDatabaseName: 'analytics',
      },
    });
  });

  it('fails when live mode is enabled without a knowledge base id', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'live');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_ID', '');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME', 'structured-source');
    vi.stubEnv('REDSHIFT_SERVERLESS_WORKGROUP_NAME', 'wg-1');
    vi.stubEnv('REDSHIFT_DATABASE_NAME', 'analytics');
    vi.stubEnv('ENABLE_BEDROCK_KB_STRUCTURED_LIVE', 'true');

    const { runBedrockStructuredPocDiagnostics } = await import(
      '../../rag/bedrock-structured-poc-diagnostics.js'
    );

    const output = await runBedrockStructuredPocDiagnostics({
      runDryFlow: true,
      runMockFlow: true,
    });

    expect(output.status).toBe('fail');
    expect(output.checks.find((check) => check.id === 'knowledge_base_id')).toMatchObject(
      {
        status: 'fail',
      },
    );
    expect(output.checks.find((check) => check.id === 'mock_flow')).toMatchObject({
      status: 'pass',
    });
    expect(output.checks.find((check) => check.id === 'dry_flow')).toMatchObject({
      status: 'pass',
    });
  });
});
