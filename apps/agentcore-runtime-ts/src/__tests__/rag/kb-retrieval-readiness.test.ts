import { describe, expect, it } from 'vitest';

describe('kb retrieval readiness', () => {
  const readyPlan = {
    id: 'plan-1',
    createdAt: '2026-05-09T00:00:00.000Z',
    query: 'maintenance policy for line A',
    intent: 'policy_lookup' as const,
    topK: 5,
    confidence: 0.9,
    metadata: {
      planner: 'deterministic-kb-query-planner',
    },
  };

  it('reports ready when KB retrieval is configured', async () => {
    const { evaluateKbRetrievalReadiness } = await import(
      '../../rag/kb-retrieval-readiness.js'
    );

    const output = evaluateKbRetrievalReadiness({
      plan: readyPlan,
      kbRetrieveEnabled: true,
      knowledgeBaseConfigured: true,
    });

    expect(output.status).toBe('ready');
    expect(output.executable).toBe(true);
    expect(output.nextAction).toBe('retrieve_kb');
    expect(output.metadata).toMatchObject({
      readiness: 'kb-retrieval-readiness-v1',
    });
  });

  it('requires clarification for short queries', async () => {
    const { evaluateKbRetrievalReadiness } = await import(
      '../../rag/kb-retrieval-readiness.js'
    );

    const output = evaluateKbRetrievalReadiness({
      plan: {
        ...readyPlan,
        query: 'policy',
        missingContext: ['document topic'],
      },
      kbRetrieveEnabled: true,
      knowledgeBaseConfigured: true,
    });

    expect(output.status).toBe('needs_clarification');
    expect(output.nextAction).toBe('ask_follow_up');
    expect(output.missingContext).toEqual(['document topic']);
  });

  it('returns not_configured when KB retrieve is disabled', async () => {
    const { evaluateKbRetrievalReadiness } = await import(
      '../../rag/kb-retrieval-readiness.js'
    );

    const output = evaluateKbRetrievalReadiness({
      plan: readyPlan,
      kbRetrieveEnabled: false,
      knowledgeBaseConfigured: true,
    });

    expect(output.status).toBe('not_configured');
    expect(output.nextAction).toBe('run_diagnostics');
    expect(output.executable).toBe(false);
  });

  it('recommends web fallback when the KB is not configured', async () => {
    const { evaluateKbRetrievalReadiness } = await import(
      '../../rag/kb-retrieval-readiness.js'
    );

    const output = evaluateKbRetrievalReadiness({
      plan: readyPlan,
      kbRetrieveEnabled: true,
      knowledgeBaseConfigured: false,
      allowWebFallback: true,
    });

    expect(output.status).toBe('fallback_recommended');
    expect(output.nextAction).toBe('fallback_to_web_research');
    expect(output.executable).toBe(false);
  });
});
