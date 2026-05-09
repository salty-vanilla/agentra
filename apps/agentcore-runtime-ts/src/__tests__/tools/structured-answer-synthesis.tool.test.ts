import { describe, expect, it } from 'vitest';
import { buildMockStructuredQueryOutput } from '../../rag/mock-structured-query-provider.js';

function buildFlow(status: 'executed' | 'needs_clarification' | 'not_configured' | 'unsupported' | 'error' = 'executed') {
  const plan = {
    id: 'plan-1',
    createdAt: '2026-05-07T00:00:00.000Z',
    intent: 'kpi_aggregation' as const,
    dataSourceKind: 'mock' as const,
    question: 'Show KPI aggregation for line A',
    confidence: 0.98,
  };
  const execution = buildMockStructuredQueryOutput({
    plan,
    createBrief: true,
    dryRun: true,
  });

  if (status !== 'executed') {
    return {
      status,
      plan,
      nextAction: 'ask_follow_up',
      messages: ['Test flow'],
      metadata: { flow: 'structured-rag-flow-v1' },
    };
  }

  return {
    status,
    plan,
    validation: { valid: true, issues: [] },
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
    },
    execution,
    nextAction: 'review_results',
    messages: ['Mock execution completed.'],
    metadata: { flow: 'structured-rag-flow-v1' },
  };
}

describe('structured answer synthesis tool', () => {
  function parseToolResponse(response: { status: string; content: Array<{ text: string }> }) {
    return JSON.parse(response.content[0]?.text ?? '{}');
  }

  it('returns a successful synthesized result for a valid flow', async () => {
    const { executeStructuredAnswerSynthesisTool } = await import(
      '../../tools/structured-answer-synthesis.tool.js'
    );

    const response = executeStructuredAnswerSynthesisTool({
      flow: buildFlow('executed'),
      includeRows: true,
      maxRows: 2,
      createBrief: true,
    });

    const parsed = parseToolResponse(response);

    expect(response.status).toBe('success');
    expect(parsed.status).toBe('answer_ready');
    expect(parsed.rowsPreview).toHaveLength(2);
    expect(parsed.brief).toBeDefined();
  });

  it('returns an error for an invalid flow status', async () => {
    const { executeStructuredAnswerSynthesisTool } = await import(
      '../../tools/structured-answer-synthesis.tool.js'
    );

    const response = executeStructuredAnswerSynthesisTool({
      flow: {
        ...(buildFlow('executed') as Record<string, unknown>),
        status: 'bogus' as unknown,
      } as never,
      createBrief: false,
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('Invalid option');
  });

  it('caps maxRows at 50 through the synthesized rows preview', async () => {
    const { executeStructuredAnswerSynthesisTool } = await import(
      '../../tools/structured-answer-synthesis.tool.js'
    );

    const plan = {
      id: 'plan-2',
      createdAt: '2026-05-07T00:00:00.000Z',
      intent: 'kpi_aggregation' as const,
      dataSourceKind: 'mock' as const,
      question: 'Show KPI aggregation for line A',
      confidence: 0.98,
    };
    const rows = Array.from({ length: 60 }, (_, index) => ({
      metric: `metric-${index}`,
      value: index,
    }));

    const response = executeStructuredAnswerSynthesisTool({
      flow: {
        status: 'executed' as const,
        plan,
        execution: {
          plan,
          status: 'success' as const,
          rows,
          summary: {
            status: 'success' as const,
            rowCount: rows.length,
            columnNames: ['metric', 'value'],
            dataSourceKind: 'mock' as const,
            intent: 'kpi_aggregation' as const,
            dryRun: true,
          },
          sources: [],
          citations: [],
          metadata: {},
        },
        nextAction: 'review_results',
        messages: ['Done.'],
        metadata: { flow: 'structured-rag-flow-v1' },
      } as never,
      includeRows: true,
      maxRows: 50,
      createBrief: false,
    });

    const parsed = parseToolResponse(response);

    expect(response.status).toBe('success');
    expect(parsed.rowsPreview).toHaveLength(50);
  });
});
