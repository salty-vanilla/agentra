import { afterEach, describe, expect, it, vi } from 'vitest';

describe('kb rag diagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reports safe warnings for an empty environment', async () => {
    vi.stubEnv('BEDROCK_KB_ID', '');
    vi.stubEnv('BEDROCK_KB_REGION', '');
    vi.stubEnv('AWS_REGION', '');
    vi.stubEnv('AWS_DEFAULT_REGION', '');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '');

    const { runKbRagDiagnostics } = await import('../../rag/kb-rag-diagnostics.js');

    const output = runKbRagDiagnostics();

    expect(output.status).toBe('warn');
    expect(output.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'kb_retrieve_tool', status: 'warn' }),
        expect.objectContaining({ id: 'knowledge_base_id', status: 'warn' }),
        expect.objectContaining({ id: 'region', status: 'warn' }),
        expect.objectContaining({ id: 'default_top_k', status: 'warn' }),
      ]),
    );
    expect(output.nextActions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('BEDROCK_KB_ID'),
        expect.stringContaining('BEDROCK_KB_REGION'),
        expect.stringContaining('BEDROCK_KB_DEFAULT_TOP_K'),
      ]),
    );
  });

  it('fails when KB retrieval is enabled but the knowledge base id is missing', async () => {
    vi.stubEnv('BEDROCK_KB_ID', '');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'true');
    vi.stubEnv('BEDROCK_KB_REGION', 'us-west-2');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '7');

    const { runKbRagDiagnostics } = await import('../../rag/kb-rag-diagnostics.js');

    const output = runKbRagDiagnostics();

    expect(output.status).toBe('fail');
    expect(output.checks.find((check) => check.id === 'knowledge_base_id')).toMatchObject(
      {
        status: 'fail',
      },
    );
  });

  it('uses region and topK fallbacks without exposing env values when redacted', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-123');
    vi.stubEnv('AWS_REGION', 'us-west-2');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '9');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const { runKbRagDiagnostics } = await import('../../rag/kb-rag-diagnostics.js');

    const output = runKbRagDiagnostics({
      includeEnvValues: false,
      metadata: {
        diagnostics: 'should-not-win',
        traceId: 'trace-1',
      },
    });

    expect(output.status).toBe('pass');
    expect(output.metadata).toMatchObject({
      diagnostics: 'kb-rag-diagnostics-v1',
      traceId: 'trace-1',
      kbRetrieveEnabled: true,
      regionSource: 'AWS_REGION',
      defaultTopKSource: 'BEDROCK_KB_DEFAULT_TOP_K',
    });
    expect(output.metadata).not.toHaveProperty('env');
    expect(output.checks.find((check) => check.id === 'region')).toMatchObject({
      status: 'pass',
    });
    expect(JSON.stringify(output.checks)).not.toContain('kb-123');
  });

  it('keeps the diagnostics marker even when caller metadata contains the same key', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-456');
    vi.stubEnv('BEDROCK_KB_REGION', 'us-east-2');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '4');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', 'true');

    const { runKbRagDiagnostics } = await import('../../rag/kb-rag-diagnostics.js');

    const output = runKbRagDiagnostics({
      metadata: {
        diagnostics: 'caller-value',
        team: 'ops',
      },
    });

    expect(output.metadata).toEqual(
      expect.objectContaining({
        diagnostics: 'kb-rag-diagnostics-v1',
        team: 'ops',
      }),
    );
  });
});
