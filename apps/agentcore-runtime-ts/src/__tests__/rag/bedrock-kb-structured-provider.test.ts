import { describe, expect, it } from 'vitest';

describe('bedrock kb structured provider', () => {
  it('returns a normalized not implemented output with configured metadata', async () => {
    const { BedrockKbStructuredProvider } = await import(
      '../../rag/bedrock-kb-structured-provider.js'
    );

    const provider = new BedrockKbStructuredProvider({
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      defaultDryRun: false,
    });

    const output = await provider.execute({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
      metadata: {
        source: 'input-metadata',
      },
    });

    expect(output.status).toBe('not_implemented');
    expect(output.summary).toMatchObject({
      status: 'not_implemented',
      rowCount: 0,
      dataSourceKind: 'bedrock_kb_structured',
      intent: 'kpi_aggregation',
      dryRun: false,
      message: 'Bedrock KB structured provider is not implemented yet.',
    });
    expect(output.metadata).toMatchObject({
      provider: 'bedrock-kb-structured-provider',
      planId: 'plan-1',
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      executionMode: 'stub',
      source: 'input-metadata',
    });
    expect(output.brief).toMatchObject({
      openQuestions: ['Bedrock KB structured provider is not implemented yet.'],
    });
    expect(output).not.toHaveProperty('rawProviderResponse');
  });

  it('delegates to an injected live adapter when live mode is ready', async () => {
    const { BedrockKbStructuredProvider } = await import(
      '../../rag/bedrock-kb-structured-provider.js'
    );

    const execute = async () => ({
      status: 'success' as const,
      rows: [
        {
          lineId: 'line-a',
          count: 7,
        },
      ],
      summary: {
        status: 'success' as const,
        rowCount: 1,
        columnNames: ['lineId', 'count'],
        dataSourceKind: 'bedrock_kb_structured' as const,
        intent: 'kpi_aggregation' as const,
        dryRun: false,
      },
      sources: [],
      citations: [],
      metadata: {
        adapter: 'fake-live-adapter',
      },
    });

    const provider = new BedrockKbStructuredProvider({
      runtimeConfig: {
        knowledgeBaseId: 'kb-123',
        region: 'ap-northeast-1',
        dataSourceName: 'structured-facts',
        mode: 'live',
        liveEnabled: true,
        redshiftServerlessWorkgroupName: 'workgroup-a',
        redshiftDatabaseName: 'warehouse',
      },
      liveAdapter: {
        execute,
      },
    });

    const output = await provider.execute({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
      dryRun: false,
    });

    expect(output.status).toBe('success');
    expect(output.rows).toHaveLength(1);
    expect(output.metadata).toMatchObject({
      adapter: 'fake-live-adapter',
    });
    expect(output.summary).toMatchObject({
      status: 'success',
      rowCount: 1,
      dataSourceKind: 'bedrock_kb_structured',
      intent: 'kpi_aggregation',
      dryRun: false,
    });
  });
});
