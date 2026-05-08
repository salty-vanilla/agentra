import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured query plan tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a structured query plan for an explicit intent', async () => {
    const { executeStructuredQueryPlanTool } = await import(
      '../../tools/structured-query-plan.tool.js'
    );

    const response = executeStructuredQueryPlanTool({
      question: 'Show error code lookup for line A',
      intent: 'error_code_lookup',
      targetEntity: 'line A',
      filters: [{ field: 'error_code', operator: 'equals', value: 'E101' }],
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.intent).toBe('error_code_lookup');
    expect(payload.confidence).toBe(0.9);
    expect(payload).not.toHaveProperty('sql');
  });

  it('rejects an empty question', async () => {
    const { executeStructuredQueryPlanTool } = await import(
      '../../tools/structured-query-plan.tool.js'
    );

    const response = executeStructuredQueryPlanTool({
      question: '   ',
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('question must not be empty');
  });

  it('rejects too many filters', async () => {
    const { executeStructuredQueryPlanTool } = await import(
      '../../tools/structured-query-plan.tool.js'
    );

    const response = executeStructuredQueryPlanTool({
      question: 'Find the issue',
      filters: Array.from({ length: 51 }, (_, index) => ({
        field: `field-${index}`,
        operator: 'equals' as const,
        value: 'x',
      })),
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('filters must not exceed 50 items');
  });
});
