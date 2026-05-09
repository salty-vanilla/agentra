import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured plan readiness tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a readiness result for a valid structured plan', async () => {
    const { executeStructuredPlanReadinessTool } = await import(
      '../../tools/structured-plan-readiness.tool.js'
    );

    const response = executeStructuredPlanReadinessTool({
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

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.status).toBe('ready');
    expect(payload.nextAction).toBe('execute_bedrock_structured');
    expect(payload).not.toHaveProperty('sql');
  });

  it('rejects an empty plan id', async () => {
    const { executeStructuredPlanReadinessTool } = await import(
      '../../tools/structured-plan-readiness.tool.js'
    );

    const response = executeStructuredPlanReadinessTool({
      plan: {
        id: '   ',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'anomaly_summary',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'temperature anomaly trend for line A',
        confidence: 0.9,
      },
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('plan.id must not be empty');
  });

  it('separates blocking and warning validation issues', async () => {
    const { executeStructuredPlanReadinessTool } = await import(
      '../../tools/structured-plan-readiness.tool.js'
    );

    const response = executeStructuredPlanReadinessTool({
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

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.blockingIssues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unknown_field',
      }),
    ]);
    expect(payload.warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'missing_time_range',
      }),
    ]);
  });

  it('does not emit SQL in the readiness payload', async () => {
    const { executeStructuredPlanReadinessTool } = await import(
      '../../tools/structured-plan-readiness.tool.js'
    );

    const response = executeStructuredPlanReadinessTool({
      plan: {
        id: 'plan-3',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        question: 'mock kpi query',
        confidence: 0.9,
      },
      allowMock: true,
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload).not.toHaveProperty('sql');
  });
});
