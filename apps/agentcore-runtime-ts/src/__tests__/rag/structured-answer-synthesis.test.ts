import { describe, expect, it } from 'vitest';
import { buildMockStructuredQueryOutput } from '../../rag/mock-structured-query-provider.js';

function buildPlan(overrides: Partial<Parameters<typeof buildMockStructuredQueryOutput>[0]['plan']> = {}) {
  return {
    id: 'plan-1',
    createdAt: '2026-05-07T00:00:00.000Z',
    intent: 'kpi_aggregation' as const,
    dataSourceKind: 'mock' as const,
    question: 'Show KPI aggregation for line A',
    confidence: 0.98,
    ...overrides,
  };
}

function buildExecutedFlow(overrides: Partial<Parameters<typeof buildMockStructuredQueryOutput>[0]> = {}) {
  const plan = overrides.plan ?? buildPlan();
  const execution = overrides.plan === undefined
    ? buildMockStructuredQueryOutput({ plan, createBrief: true, dryRun: true })
    : buildMockStructuredQueryOutput({
        plan,
        createBrief: true,
        dryRun: true,
      });

  return {
    status: 'executed' as const,
    plan,
    validation: {
      valid: true,
      issues: [],
      metadata: { validator: 'test' },
    },
    readiness: {
      status: 'ready' as const,
      recommendedProvider: 'mock' as const,
      nextAction: 'execute_mock' as const,
      executable: true,
      missingSlots: [],
      blockingIssues: [],
      warnings: [],
      rationale: ['ready'],
      plan,
      metadata: { evaluator: 'test' },
    },
    execution,
    nextAction: 'review_results',
    messages: ['Mock execution completed.'],
    metadata: { flow: 'structured-rag-flow-v1' },
    ...overrides,
  };
}

describe('structured answer synthesis', () => {
  it('normalizes a successful execution into an answer-ready payload', async () => {
    const { synthesizeStructuredAnswer } = await import('../../rag/structured-answer-synthesis.js');

    const flow = buildExecutedFlow();
    const output = synthesizeStructuredAnswer({
      flow,
      includeRows: true,
      maxRows: 2,
      createBrief: true,
      metadata: { requestId: 'req-1', synthesizer: 'override-attempt' },
    });

    expect(output.status).toBe('answer_ready');
    expect(output.title).toBe('KPI aggregation');
    expect(output.summary).toContain('KPI aggregation returned');
    expect(output.keyFindings[0]).toBe('Found 2 mock KPI rows.');
    expect(output.caveats).toContain(
      'Rows are mock/demo data and must not be treated as production data.',
    );
    expect(output.rowsPreview).toHaveLength(2);
    expect(output.brief).toMatchObject({
      goal: 'Summarize structured query execution results.',
      topic: 'Show KPI aggregation for line A',
    });
    expect(output.metadata).toMatchObject({
      requestId: 'req-1',
      synthesizer: 'structured-answer-synthesis-v1',
      status: 'answer_ready',
      intent: 'kpi_aggregation',
    });
  });

  it('marks empty execution as no_data and keeps citations caveat when none exist', async () => {
    const { synthesizeStructuredAnswer } = await import('../../rag/structured-answer-synthesis.js');

    const plan = buildPlan({
      question: 'Show KPI aggregation for an empty segment',
      metadata: { scope: 'empty' },
    });
    const flow = {
      status: 'executed' as const,
      plan,
      execution: {
        plan,
        status: 'empty' as const,
        rows: [],
        summary: {
          status: 'empty' as const,
          rowCount: 0,
          columnNames: [],
          dataSourceKind: 'mock' as const,
          intent: 'kpi_aggregation' as const,
          dryRun: true,
        },
        sources: [],
        citations: [],
        metadata: { provider: 'mock' },
      },
      nextAction: 'review_results',
      messages: ['No rows.'],
      metadata: { flow: 'structured-rag-flow-v1' },
    };

    const output = synthesizeStructuredAnswer({
      flow,
      createBrief: false,
    });

    expect(output.status).toBe('no_data');
    expect(output.keyFindings).toEqual(['No structured rows were returned.']);
    expect(output.caveats).toContain('No citations were available for this structured result.');
    expect(output.brief).toBeUndefined();
  });

  it('surfaces missing slots and blocking issues for clarification', async () => {
    const { synthesizeStructuredAnswer } = await import('../../rag/structured-answer-synthesis.js');

    const plan = buildPlan({
      question: 'Show KPI aggregation',
      missingSlots: ['timeRange.end', 'targetEntity'],
    });
    const flow = {
      status: 'needs_clarification' as const,
      plan,
      readiness: {
        status: 'needs_clarification' as const,
        recommendedProvider: 'mock' as const,
        nextAction: 'ask_follow_up' as const,
        executable: false,
        missingSlots: ['timeRange.end', 'targetEntity'],
        blockingIssues: [
          {
            severity: 'error' as const,
            code: 'missing_slot',
            message: 'Missing required slot: timeRange.end.',
          },
        ],
        warnings: [],
        rationale: ['Plan needs clarification before structured execution.'],
        plan,
      },
      nextAction: 'ask_follow_up',
      messages: ['Need clarification.'],
      metadata: { flow: 'structured-rag-flow-v1' },
    };

    const output = synthesizeStructuredAnswer({
      flow,
      createBrief: false,
    });

    expect(output.status).toBe('needs_clarification');
    expect(output.keyFindings).toContain('Missing required slot: timeRange.end.');
    expect(output.keyFindings).toContain('Missing required slot: targetEntity.');
    expect(output.keyFindings).toContain('Missing required slot: timeRange.end.');
    expect(output.nextActions[0]).toContain('missing slots');
  });

  it('caps the rows preview at 50 entries', async () => {
    const { synthesizeStructuredAnswer } = await import('../../rag/structured-answer-synthesis.js');

    const plan = buildPlan();
    const rows = Array.from({ length: 60 }, (_, index) => ({
      metric: `metric-${index}`,
      value: index,
      active: index % 2 === 0,
    }));
    const flow = {
      status: 'executed' as const,
      plan,
      execution: {
        plan,
        status: 'success' as const,
        rows,
        summary: {
          status: 'success' as const,
          rowCount: rows.length,
          columnNames: ['metric', 'value', 'active'],
          dataSourceKind: 'mock' as const,
          intent: 'kpi_aggregation' as const,
          dryRun: true,
        },
        sources: [],
        citations: [],
        brief: undefined,
        metadata: {},
      },
      nextAction: 'review_results',
      messages: ['Done.'],
      metadata: { flow: 'structured-rag-flow-v1' },
    };

    const output = synthesizeStructuredAnswer({
      flow,
      includeRows: true,
      maxRows: 100,
      createBrief: false,
    });

    expect(output.rowsPreview).toHaveLength(50);
  });
});
