import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('kb query readiness tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a plan from query input and returns readiness', async () => {
    const { executeKbQueryReadinessTool } = await import(
      '../../tools/kb-query-readiness.tool.js'
    );

    const response = executeKbQueryReadinessTool({
      query: 'maintenance policy for line A',
      kbRetrieveEnabled: true,
      knowledgeBaseConfigured: true,
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.plan.query).toBe('maintenance policy for line A');
    expect(payload.readiness.status).toBe('ready');
    expect(payload.readiness.nextAction).toBe('retrieve_kb');
  });

  it('accepts an existing plan without creating a new one', async () => {
    const { executeKbQueryReadinessTool } = await import(
      '../../tools/kb-query-readiness.tool.js'
    );

    const response = executeKbQueryReadinessTool({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        query: 'policy',
        intent: 'policy_lookup',
        topK: 5,
        confidence: 0.9,
        metadata: {
          planner: 'deterministic-kb-query-planner',
        },
        missingContext: ['document topic'],
      },
      kbRetrieveEnabled: true,
      knowledgeBaseConfigured: true,
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.plan.id).toBe('plan-1');
    expect(payload.readiness.status).toBe('needs_clarification');
  });

  it('returns an error when no plan or query is provided', async () => {
    const { executeKbQueryReadinessTool } = await import(
      '../../tools/kb-query-readiness.tool.js'
    );

    const response = executeKbQueryReadinessTool({});

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain(
      'query, plan, or planInput must be provided',
    );
  });
});
