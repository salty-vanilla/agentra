import { describe, expect, it } from 'vitest';

describe('structured rag flow', () => {
  it('creates a plan only without validating or executing', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      question: 'Show error code lookup for line A',
      mode: 'plan_only',
    });

    expect(output.status).toBe('planned');
    expect(output.plan.question).toBe('Show error code lookup for line A');
    expect(output.validation).toBeUndefined();
    expect(output.readiness).toBeUndefined();
    expect(output.execution).toBeUndefined();
    expect(output.messages).toContain('Structured query plan created.');
    expect(output.metadata).toMatchObject({
      flow: 'structured-rag-flow-v1',
    });
  });

  it('validates without executing in validate_only mode', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show KPI aggregation for line A',
        intent: 'kpi_aggregation',
        metrics: ['count'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
      },
      metadata: { traceId: 'trace-1', flow: 'override-attempt' },
      mode: 'validate_only',
    });

    expect(output.status).toBe('validated');
    expect(output.validation?.valid).toBe(true);
    expect(output.readiness).toBeUndefined();
    expect(output.execution).toBeUndefined();
    expect(output.metadata).toMatchObject({
      flow: 'structured-rag-flow-v1',
    });
    expect(output).not.toHaveProperty('sql');
  });

  it('reports readiness without executing in readiness_only mode', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show mock KPI aggregation',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        metrics: ['count'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
        metadata: { flow: 'override-attempt' },
      },
      mode: 'readiness_only',
      allowMock: true,
    });

    expect(output.status).toBe('ready');
    expect(output.readiness?.executable).toBe(true);
    expect(output.execution).toBeUndefined();
    expect(output.metadata).toMatchObject({
      flow: 'structured-rag-flow-v1',
    });
  });

  it('executes mock only when allowed', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show mock KPI aggregation',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        metrics: ['count'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
      },
      allowMock: true,
      preferredProvider: 'mock',
      createBrief: false,
    });

    expect(output.status).toBe('executed');
    expect(output.readiness?.recommendedProvider).toBe('mock');
    expect(output.execution?.summary.dataSourceKind).toBe('mock');
    expect(output.execution?.status).toBe('success');
    expect(output.messages).toContain('Mock execution completed.');
    expect(output.execution).not.toHaveProperty('sql');
  });

  it('does not execute mock when allowMock is false', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show mock KPI aggregation',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        metrics: ['count'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
      },
      allowMock: false,
      preferredProvider: 'mock',
    });

    expect(output.status).toBe('not_configured');
    expect(output.execution).toBeUndefined();
    expect(output.readiness?.nextAction).toBe('ask_follow_up');
  });

  it('does not execute Bedrock structured when disabled', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show KPI aggregation for line A',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        metrics: ['count'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
      },
      preferredProvider: 'bedrock_kb_structured',
      bedrockStructuredEnabled: false,
    });

    expect(output.status).toBe('not_configured');
    expect(output.execution).toBeUndefined();
  });

  it('rejects the future query generator path', async () => {
    const { runStructuredRagFlow } = await import('../../rag/structured-rag-flow.js');

    const output = await runStructuredRagFlow({
      planInput: {
        question: 'Show production trend',
        intent: 'production_trend',
        dataSourceKind: 'athena',
        metrics: ['trend'],
      },
      preferredProvider: 'athena_query_generator_future',
      queryGeneratorEnabled: true,
    });

    expect(output.status).toBe('unsupported');
    expect(output.readiness?.executable).toBe(false);
    expect(output.execution).toBeUndefined();
  });
});
