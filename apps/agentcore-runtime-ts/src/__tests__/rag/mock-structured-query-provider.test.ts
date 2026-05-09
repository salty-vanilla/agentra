import { describe, expect, it } from 'vitest';

describe('mock structured query provider', () => {
  it('returns deterministic rows, sources, citations, and a brief for error code lookup', async () => {
    const { MockStructuredQueryProvider } = await import(
      '../../rag/mock-structured-query-provider.js'
    );

    const provider = new MockStructuredQueryProvider();
    const output = await provider.execute({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'error_code_lookup',
        dataSourceKind: 'mock',
        question: 'What does E-TEMP-001 mean?',
        confidence: 0.98,
        metadata: {
          planner: 'deterministic',
        },
      },
    });

    expect(output.status).toBe('success');
    expect(output.rows).toEqual([
      {
        errorCode: 'E-TEMP-001',
        severity: 'high',
        description: 'Temperature exceeded configured threshold.',
        recommendedAction: 'Check cooling unit and recent load changes.',
      },
    ]);
    expect(output.summary).toMatchObject({
      status: 'success',
      rowCount: 1,
      columnNames: ['errorCode', 'severity', 'description', 'recommendedAction'],
      dataSourceKind: 'mock',
      intent: 'error_code_lookup',
      dryRun: true,
    });
    expect(output.sources).toHaveLength(1);
    expect(output.sources[0]).toMatchObject({
      type: 'structured_data',
      title: 'Mock structured query result: error_code_lookup',
      metadata: {
        provider: 'mock-structured-query-provider',
        planId: 'plan-1',
        intent: 'error_code_lookup',
        dataSourceKind: 'mock',
        planner: 'deterministic',
      },
    });
    expect(output.citations).toHaveLength(1);
    expect(output.metadata).toMatchObject({
      provider: 'mock-structured-query-provider',
      planId: 'plan-1',
      planner: 'deterministic',
    });
    expect(output.brief).toMatchObject({
      language: 'unknown',
      outputFormat: 'report',
      topic: 'What does E-TEMP-001 mean?',
      goal: 'Summarize structured query execution results.',
      keyFacts: ['Found 1 mock error-code row.'],
      sourceIds: [output.sources[0]?.id],
      metadata: {
        provider: 'mock-structured-query-provider',
        planId: 'plan-1',
        intent: 'error_code_lookup',
      },
    });
  });

  it('returns structured anomaly and production trend rows deterministically', async () => {
    const { buildMockStructuredQueryOutput } = await import(
      '../../rag/mock-structured-query-provider.js'
    );

    const anomalyOutput = buildMockStructuredQueryOutput({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'mock',
        question: 'Summarize temperature anomalies for line-7.',
        targetEntity: 'line-7',
        confidence: 0.9,
        metadata: {
          targetSignals: ['pressure'],
        },
      },
      dryRun: false,
    });

    expect(anomalyOutput.rows[0]).toMatchObject({
      lineId: 'line-7',
      signal: 'pressure',
      anomalyCount: 3,
      peakValue: 87.4,
      averageValue: 74.2,
    });
    expect(anomalyOutput.summary).toMatchObject({
      rowCount: 1,
      dryRun: false,
    });
    expect(anomalyOutput.brief?.keyFacts).toEqual(['Found 3 mock pressure anomalies.']);

    const productionOutput = buildMockStructuredQueryOutput({
      plan: {
        id: 'plan-3',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'production_trend',
        dataSourceKind: 'mock',
        question: 'Show the production trend.',
        confidence: 0.9,
      },
    });

    expect(productionOutput.rows).toEqual([
      { period: '2026-Q1', productionCount: 10200 },
      { period: '2026-Q2', productionCount: 10850 },
    ]);
    expect(productionOutput.summary.columnNames).toEqual([
      'period',
      'productionCount',
    ]);
  });

  it('returns empty output for unknown intents and can omit the brief', async () => {
    const { buildMockStructuredQueryOutput } = await import(
      '../../rag/mock-structured-query-provider.js'
    );

    const output = buildMockStructuredQueryOutput({
      plan: {
        id: 'plan-4',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'unknown',
        dataSourceKind: 'mock',
        question: 'What does this map to?',
        confidence: 0.1,
      },
      createBrief: false,
    });

    expect(output.status).toBe('empty');
    expect(output.rows).toEqual([]);
    expect(output.summary).toMatchObject({
      status: 'empty',
      rowCount: 0,
      columnNames: [],
      message: 'No mock rows are available for this structured query intent.',
    });
    expect(output.brief).toBeUndefined();
  });
});
