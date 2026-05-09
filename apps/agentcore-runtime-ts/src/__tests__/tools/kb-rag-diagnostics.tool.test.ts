import { afterEach, describe, expect, it, vi } from 'vitest';

describe('kb rag diagnostics tool', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns diagnostics output through the tool wrapper', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-789');
    vi.stubEnv('AWS_DEFAULT_REGION', 'us-west-1');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '12');
    vi.stubEnv('ENABLE_KB_RETRIEVE_TOOL', '');

    const { executeKbRagDiagnosticsTool } = await import(
      '../../tools/kb-rag-diagnostics.tool.js'
    );

    const response = executeKbRagDiagnosticsTool({
      includeEnvValues: true,
      metadata: {
        traceId: 'trace-2',
      },
    });

    expect(response.status).toBe('success');
    expect(response.content).toHaveLength(1);

    const parsed = JSON.parse(response.content[0].text) as {
      status: string;
      metadata?: Record<string, unknown>;
      checks: Array<{ id: string }>;
    };

    expect(parsed.status).toBe('pass');
    expect(parsed.metadata).toMatchObject({
      diagnostics: 'kb-rag-diagnostics-v1',
      traceId: 'trace-2',
    });
    expect(parsed.checks.map((check) => check.id)).toEqual([
      'kb_retrieve_tool',
      'knowledge_base_id',
      'region',
      'default_top_k',
    ]);
  });
});
