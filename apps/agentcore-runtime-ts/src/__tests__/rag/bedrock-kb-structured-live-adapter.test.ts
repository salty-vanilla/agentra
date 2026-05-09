import { describe, expect, it } from 'vitest';

describe('bedrock kb structured live adapter', () => {
  it('returns a safe not implemented raw result by default', async () => {
    const { createBedrockKbStructuredLiveAdapter } = await import(
      '../../rag/bedrock-kb-structured-live-adapter.js'
    );

    const adapter = createBedrockKbStructuredLiveAdapter({
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
    });

    const output = await adapter.execute({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      executionMode: 'live',
      dryRun: false,
    });

    expect(output.status).toBe('not_implemented');
    expect(output.message).toContain('not implemented yet');
    expect(output.metadata).toMatchObject({
      provider: 'bedrock-kb-structured-provider',
      planId: 'plan-1',
      executionMode: 'live',
    });
  });
});
