import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured query execute mock tool', () => {
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

  it('returns a successful mock execution result for a valid structured query plan', async () => {
    const { executeStructuredQueryExecuteMockTool } = await import(
      '../../tools/structured-query-execute-mock.tool.js'
    );

    const response = await executeStructuredQueryExecuteMockTool({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'error_code_lookup',
        dataSourceKind: 'mock',
        question: 'What does E-TEMP-001 mean?',
        confidence: 0.98,
      },
    });

    const parsed = parseToolResponse(response);

    expect(response.status).toBe('success');
    expect(parsed.status).toBe('success');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed).not.toHaveProperty('sql');
    expect(parsed.brief).toMatchObject({
      goal: 'Summarize structured query execution results.',
    });
  });

  it('returns an error when the plan id is empty', async () => {
    const { executeStructuredQueryExecuteMockTool } = await import(
      '../../tools/structured-query-execute-mock.tool.js'
    );

    const response = await executeStructuredQueryExecuteMockTool({
      plan: {
        id: '   ',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'unknown',
        dataSourceKind: 'mock',
        question: 'Test query',
        confidence: 0.1,
      },
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('plan.id must not be empty');
  });

  it('returns an empty result for unknown intents and can omit the brief', async () => {
    const { executeStructuredQueryExecuteMockTool } = await import(
      '../../tools/structured-query-execute-mock.tool.js'
    );

    const response = await executeStructuredQueryExecuteMockTool({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'unknown',
        dataSourceKind: 'mock',
        question: 'Test query',
        confidence: 0.1,
      },
      createBrief: false,
    });

    const parsed = parseToolResponse(response);

    expect(response.status).toBe('success');
    expect(parsed.status).toBe('empty');
    expect(parsed.rows).toEqual([]);
    expect(parsed.brief).toBeUndefined();
  });
});
