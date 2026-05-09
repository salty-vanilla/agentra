import { describe, expect, it } from 'vitest';

describe('bedrock kb structured provider', () => {
  it('returns an explicit not implemented result with sources, citations, and a brief', async () => {
    const { BedrockKbStructuredProvider } = await import(
      '../../rag/bedrock-kb-structured-provider.js'
    );

    const provider = new BedrockKbStructuredProvider({
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'factory-metrics',
    });

    const output = await provider.execute({
      plan: {
        id: 'plan-123',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
    });

    expect(output.status).toBe('not_implemented');
    expect(output.plan).toMatchObject({
      id: 'plan-123',
      intent: 'kpi_aggregation',
      dataSourceKind: 'bedrock_kb_structured',
    });
    expect(output.rows).toEqual([]);
    expect(output.summary).toEqual({
      status: 'not_implemented',
      rowCount: 0,
      columnNames: [],
      dataSourceKind: 'bedrock_kb_structured',
      intent: 'kpi_aggregation',
      dryRun: true,
      message: 'Bedrock KB structured provider is not implemented yet.',
    });
    expect(output.sources).toHaveLength(1);
    expect(output.sources[0]).toMatchObject({
      type: 'structured_data',
      title: 'Bedrock KB structured query stub: kpi_aggregation',
      snippet:
        'Bedrock KB structured provider is not implemented yet. No real data was queried.',
      metadata: {
        provider: 'bedrock-kb-structured-provider',
        planId: 'plan-123',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        status: 'not_implemented',
      },
    });
    expect(output.citations).toHaveLength(1);
    expect(output.citations[0]).toMatchObject({
      label: '[1]',
      sourceId: output.sources[0]?.id,
      type: 'structured_data',
      title: 'Bedrock KB structured query stub: kpi_aggregation',
    });
    expect(output.brief).toMatchObject({
      language: 'unknown',
      outputFormat: 'report',
      topic: 'Show KPI aggregation for line A',
      goal: 'Summarize structured query execution results.',
      sourceIds: [output.sources[0]?.id],
      metadata: {
        provider: 'bedrock-kb-structured-provider',
        planId: 'plan-123',
        intent: 'kpi_aggregation',
        status: 'not_implemented',
      },
      openQuestions: ['Bedrock KB structured provider is not implemented yet.'],
    });
    expect(output.metadata).toEqual({
      provider: 'bedrock-kb-structured-provider',
      planId: 'plan-123',
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'factory-metrics',
    });
  });

  it('omits the brief when createBrief is false', async () => {
    const { BedrockKbStructuredProvider } = await import(
      '../../rag/bedrock-kb-structured-provider.js'
    );

    const provider = new BedrockKbStructuredProvider();

    const output = await provider.execute({
      plan: {
        id: 'plan-456',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'production_trend',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show production trend',
        confidence: 0.8,
      },
      createBrief: false,
    });

    expect(output.brief).toBeUndefined();
    expect(output.status).toBe('not_implemented');
  });
});
