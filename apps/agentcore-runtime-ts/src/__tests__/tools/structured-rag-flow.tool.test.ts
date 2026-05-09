import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured rag flow tool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function parseToolResponse(response: {
    status: string;
    content: Array<{ text: string }>;
  }) {
    return JSON.parse(response.content[0]?.text ?? '{}');
  }

  it('succeeds with question only', async () => {
    const { executeStructuredRagFlowTool } = await import(
      '../../tools/structured-rag-flow.tool.js'
    );

    const response = await executeStructuredRagFlowTool({
      question: 'Show KPI aggregation for line A',
      mode: 'plan_only',
    });

    expect(response.status).toBe('success');
    expect(parseToolResponse(response).status).toBe('planned');
  });

  it('succeeds with a plan', async () => {
    const { executeStructuredRagFlowTool } = await import(
      '../../tools/structured-rag-flow.tool.js'
    );

    const response = await executeStructuredRagFlowTool({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'mock',
        question: 'Show KPI aggregation for line A',
        confidence: 0.95,
      },
      mode: 'validate_only',
    });

    expect(response.status).toBe('success');
    expect(parseToolResponse(response).status).toBe('validated');
  });

  it('returns an error when no input is provided', async () => {
    const { executeStructuredRagFlowTool } = await import(
      '../../tools/structured-rag-flow.tool.js'
    );

    const response = await executeStructuredRagFlowTool({} as never);

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain(
      'Provide at least one of question, plan, or planInput.',
    );
  });

  it('returns an error for too long questions', async () => {
    const { executeStructuredRagFlowTool } = await import(
      '../../tools/structured-rag-flow.tool.js'
    );

    const response = await executeStructuredRagFlowTool({
      question: 'x'.repeat(2001),
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('must not exceed 2000 characters');
  });
});
