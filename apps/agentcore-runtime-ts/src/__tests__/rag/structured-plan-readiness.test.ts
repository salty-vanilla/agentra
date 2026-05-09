import { describe, expect, it } from 'vitest';

describe('structured plan readiness', () => {
  it('reports a ready bedrock plan with executable next action', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'temperature anomaly trend for line A',
        targetEntity: 'line A',
        metrics: ['average'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
        confidence: 0.9,
      },
      bedrockStructuredEnabled: true,
    });

    expect(output.status).toBe('ready');
    expect(output.recommendedProvider).toBe('bedrock_kb_structured');
    expect(output.nextAction).toBe('execute_bedrock_structured');
    expect(output.executable).toBe(true);
    expect(output.blockingIssues).toEqual([]);
    expect(output.warnings).toEqual([]);
    expect(output.metadata).toMatchObject({
      evaluator: 'structured-plan-readiness-v1',
      recommendedProvider: 'bedrock_kb_structured',
      status: 'ready',
      executable: true,
    });
  });

  it('reports bedrock as not configured when the provider is disabled', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'temperature anomaly trend for line A',
        targetEntity: 'line A',
        metrics: ['average'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
        confidence: 0.9,
      },
      bedrockStructuredEnabled: false,
    });

    expect(output.status).toBe('not_configured');
    expect(output.nextAction).toBe('inspect_catalog');
    expect(output.executable).toBe(false);
  });

  it('asks a follow-up when missing slots remain', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-3',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'temperature anomaly trend',
        confidence: 0.6,
        missingSlots: ['target entity', 'signal or metric', 'time range'],
      },
      bedrockStructuredEnabled: true,
    });

    expect(output.status).toBe('needs_clarification');
    expect(output.nextAction).toBe('ask_follow_up');
    expect(output.executable).toBe(false);
    expect(output.missingSlots).toEqual([
      'target entity',
      'signal or metric',
      'time range',
    ]);
    expect(output.blockingIssues[0]).toMatchObject({
      severity: 'error',
      code: 'missing_slot',
    });
  });

  it('treats validation errors as blocking issues', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-4',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'kpi aggregation for line A',
        confidence: 0.9,
      },
      validation: {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'unknown_field',
            message: 'Unknown field: foo',
          },
          {
            severity: 'warning',
            code: 'missing_time_range',
            message: 'Consider adding a time range.',
          },
        ],
      },
      bedrockStructuredEnabled: true,
    });

    expect(output.status).toBe('needs_clarification');
    expect(output.blockingIssues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unknown_field',
      }),
    ]);
    expect(output.warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'missing_time_range',
      }),
    ]);
  });

  it('skips catalog validation when requested and avoids duplicate missing-slot issues', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-4b',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'kpi aggregation for line A',
        confidence: 0.9,
        missingSlots: ['time range'],
      },
      skipCatalogValidation: true,
      bedrockStructuredEnabled: true,
    });

    expect(output.status).toBe('needs_clarification');
    expect(output.blockingIssues).toHaveLength(1);
    expect(output.blockingIssues[0]).toMatchObject({
      severity: 'error',
      code: 'missing_slot',
    });
    expect(output.warnings).toEqual([]);
  });

  it('reports mock readiness when mock execution is allowed', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-5',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        question: 'mock kpi query',
        confidence: 0.9,
      },
      allowMock: true,
    });

    expect(output.status).toBe('ready');
    expect(output.recommendedProvider).toBe('mock');
    expect(output.nextAction).toBe('execute_mock');
    expect(output.executable).toBe(true);
  });

  it('reports mock readiness as not configured when mock execution is disabled', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-6',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        question: 'mock kpi query',
        confidence: 0.9,
      },
      allowMock: false,
    });

    expect(output.status).toBe('not_configured');
    expect(output.nextAction).toBe('ask_follow_up');
    expect(output.executable).toBe(false);
  });

  it('treats the future query generator as unsupported until enabled', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-7',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'production_trend',
        dataSourceKind: 'athena',
        question: 'production trend',
        confidence: 0.8,
      },
      preferredProvider: 'athena_query_generator_future',
      queryGeneratorEnabled: false,
    });

    expect(output.status).toBe('unsupported');
    expect(output.nextAction).toBe('not_supported');
    expect(output.executable).toBe(false);
  });

  it('keeps the evaluator metadata stable', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-8',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'temperature anomaly trend for line A',
        targetEntity: 'line A',
        metrics: ['average'],
        timeRange: { start: '2026-05-01', end: '2026-05-07' },
        confidence: 0.9,
      },
      bedrockStructuredEnabled: true,
      metadata: {
        evaluator: 'custom',
        traceId: 'trace-1',
      },
    });

    expect(output.metadata).toEqual(
      expect.objectContaining({
        evaluator: 'structured-plan-readiness-v1',
        traceId: 'trace-1',
      }),
    );
  });

  it('supports the future query generator path without executing it', async () => {
    const { evaluateStructuredPlanReadiness } = await import(
      '../../rag/structured-plan-readiness.js'
    );

    const output = evaluateStructuredPlanReadiness({
      plan: {
        id: 'plan-9',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'production_trend',
        dataSourceKind: 'athena',
        question: 'production trend',
        confidence: 0.8,
      },
      preferredProvider: 'athena_query_generator_future',
      queryGeneratorEnabled: true,
    });

    expect(output.status).toBe('ready');
    expect(output.nextAction).toBe('inspect_catalog');
    expect(output.executable).toBe(false);
  });
});
