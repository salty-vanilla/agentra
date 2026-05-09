import { describe, expect, it, vi } from 'vitest';

function buildPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    createdAt: '2026-05-09T00:00:00.000Z',
    query: 'agentra runtime policy',
    intent: 'document_lookup' as const,
    topK: 5,
    confidence: 0.95,
    metadata: {
      planner: 'deterministic-kb-query-planner',
    },
    ...overrides,
  };
}

function buildRetrieval(overrides: Record<string, unknown> = {}) {
  return {
    query: 'agentra runtime policy',
    provider: 'bedrock_kb_retrieve' as const,
    sources: [
      {
        id: 'source-1',
        type: 'document' as const,
        title: 'Policy document',
        snippet: 'First internal policy chunk.',
        retrievedAt: '2026-05-09T00:00:00.000Z',
        score: 0.93,
      },
    ],
    citations: [
      {
        id: 'citation-1',
        label: '[1]',
        sourceId: 'source-1',
        type: 'document' as const,
      },
    ],
    rawResultSummary: {
      resultCount: 1,
      originalResultCount: 1,
    },
    metadata: {
      provider: 'bedrock-kb',
      knowledgeBaseId: 'kb-123',
      query: 'agentra runtime policy',
      flow: 'kb-rag-flow-v1',
    },
    ...overrides,
  };
}

describe('kb rag flow', () => {
  it('returns a planned flow without retrieving when mode is plan_only', async () => {
    const { runKbRagFlow } = await import('../rag/kb-rag-flow.js');
    const search = vi.fn();

    const output = await runKbRagFlow(
      {
        plan: buildPlan({
          metadata: {
            planner: 'deterministic-kb-query-planner',
          },
        }),
        mode: 'plan_only',
        metadata: {
          flow: 'user-attempt',
          requestId: 'req-1',
        },
      },
      {
        serviceFactory: () => ({ search }),
      },
    );

    expect(output.status).toBe('planned');
    expect(output.nextAction).toBe('review_plan');
    expect(output.messages).toContain('KB RAG plan accepted.');
    expect(output.metadata).toEqual({
      flow: 'kb-rag-flow-v1',
      requestId: 'req-1',
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('evaluates readiness without retrieving when mode is readiness_only', async () => {
    const { runKbRagFlow } = await import('../rag/kb-rag-flow.js');
    const search = vi.fn();

    const output = await runKbRagFlow(
      {
        planInput: {
          query: 'agentra runtime policy',
        },
        mode: 'readiness_only',
        knowledgeBaseConfigured: true,
      },
      {
        serviceFactory: () => ({ search }),
      },
    );

    expect(output.status).toBe('ready');
    expect(output.readiness?.status).toBe('ready');
    expect(output.nextAction).toBe('retrieve_kb');
    expect(output.messages).toContain('KB retrieval readiness evaluated.');
    expect(search).not.toHaveBeenCalled();
  });

  it('retrieves evidence when the flow is ready', async () => {
    const { runKbRagFlow } = await import('../rag/kb-rag-flow.js');
    const search = vi.fn().mockResolvedValue(buildRetrieval());

    const output = await runKbRagFlow(
      {
        query: 'agentra runtime policy',
        knowledgeBaseConfigured: true,
        createBrief: false,
        metadata: {
          requestId: 'req-2',
          flow: 'user-attempt',
        },
      },
      {
        serviceFactory: () => ({ search }),
      },
    );

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'agentra runtime policy',
        topK: 5,
        createBrief: false,
        metadata: {
          requestId: 'req-2',
          flow: 'kb-rag-flow-v1',
        },
      }),
    );
    expect(output.status).toBe('retrieved');
    expect(output.nextAction).toBe('review_results');
    expect(output.retrieval?.provider).toBe('bedrock_kb_retrieve');
    expect(output.metadata).toEqual({
      requestId: 'req-2',
      flow: 'kb-rag-flow-v1',
    });
  });

  it('does not retrieve when KB configuration is missing', async () => {
    const { runKbRagFlow } = await import('../rag/kb-rag-flow.js');
    const search = vi.fn();

    const output = await runKbRagFlow(
      {
        query: 'agentra runtime policy',
        knowledgeBaseConfigured: false,
      },
      {
        serviceFactory: () => ({ search }),
      },
    );

    expect(output.status).toBe('not_configured');
    expect(output.nextAction).toBe('run_diagnostics');
    expect(search).not.toHaveBeenCalled();
  });

  it('recommends fallback without retrieving when web fallback is allowed', async () => {
    const { runKbRagFlow } = await import('../rag/kb-rag-flow.js');
    const search = vi.fn();

    const output = await runKbRagFlow(
      {
        query: 'agentra runtime policy',
        knowledgeBaseConfigured: false,
        allowWebFallback: true,
      },
      {
        serviceFactory: () => ({ search }),
      },
    );

    expect(output.status).toBe('fallback_recommended');
    expect(output.nextAction).toBe('fallback_to_web_research');
    expect(search).not.toHaveBeenCalled();
  });
});
