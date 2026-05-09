import { describe, expect, it } from 'vitest';

function buildRetrieval(overrides: Record<string, unknown> = {}) {
  return {
    query: 'agentra runtime policy',
    provider: 'bedrock_kb_retrieve' as const,
    sources: [
      {
        id: 'source-1',
        type: 'document' as const,
        title: 'Policy document',
        uri: 's3://agentra-docs/policy.md',
        snippet: 'First internal policy chunk.',
        retrievedAt: '2026-05-09T00:00:00.000Z',
        score: 0.93,
        metadata: {
          provider: 'bedrock-kb',
        },
      },
      {
        id: 'source-2',
        type: 'document' as const,
        title: 'Runbook',
        uri: 's3://agentra-docs/runbook.md',
        snippet: 'Second internal runbook chunk.',
        retrievedAt: '2026-05-09T00:00:00.000Z',
        score: 0.82,
      },
      {
        id: 'source-3',
        type: 'document' as const,
        title: 'Reference',
        uri: 's3://agentra-docs/reference.md',
        snippet: 'Third internal reference chunk.',
        retrievedAt: '2026-05-09T00:00:00.000Z',
        score: 0.75,
      },
    ],
    citations: [
      {
        id: 'citation-1',
        label: '[1]',
        sourceId: 'source-1',
        type: 'document' as const,
        title: 'Policy document',
        uri: 's3://agentra-docs/policy.md',
      },
      {
        id: 'citation-2',
        label: '[2]',
        sourceId: 'source-2',
        type: 'document' as const,
        title: 'Runbook',
        uri: 's3://agentra-docs/runbook.md',
      },
      {
        id: 'citation-3',
        label: '[3]',
        sourceId: 'source-3',
        type: 'document' as const,
        title: 'Reference',
        uri: 's3://agentra-docs/reference.md',
      },
    ],
    brief: {
      id: 'brief-1',
      createdAt: '2026-05-09T00:00:00.000Z',
      language: 'en' as const,
      outputFormat: 'report' as const,
      topic: 'Runtime policy',
      goal: 'Summarize KB evidence',
      keyFacts: ['First internal policy chunk.'],
      sourceIds: ['source-1', 'source-2', 'source-3'],
      metadata: {
        provider: 'bedrock-kb',
        query: 'agentra runtime policy',
      },
    },
    rawResultSummary: {
      resultCount: 3,
      originalResultCount: 3,
    },
    metadata: {
      provider: 'bedrock-kb',
      knowledgeBaseId: 'kb-123',
      query: 'agentra runtime policy',
    },
    ...overrides,
  };
}

describe('kb answer synthesis', () => {
  it('normalizes ready KB evidence into a grounded answer payload', async () => {
    const { synthesizeKbAnswer } = await import('../../rag/kb-answer-synthesis.js');

    const output = synthesizeKbAnswer({
      flow: {
        status: 'answer_ready',
        retrieval: buildRetrieval(),
        metadata: { flow: 'kb-answer-flow-v1' },
      },
      includeSourcePreview: true,
      maxSources: 2,
      createBrief: true,
      metadata: { requestId: 'req-1', synthesizer: 'override-attempt' },
    });

    expect(output.status).toBe('answer_ready');
    expect(output.title).toContain('KB answer:');
    expect(output.summary).toBe('KB retrieval returned 3 sources.');
    expect(output.keyFindings).toEqual(['First internal policy chunk.']);
    expect(output.caveats).toEqual([]);
    expect(output.nextActions[0]).toContain('grounded evidence');
    expect(output.sources).toHaveLength(3);
    expect(output.citations).toHaveLength(3);
    expect(output.citations[0]).toMatchObject({
      label: '[1]',
      sourceId: 'source-1',
    });
    expect(output.sourcePreview).toHaveLength(2);
    expect(output.brief).toMatchObject({
      topic: 'Runtime policy',
      goal: 'Summarize KB evidence',
      sourceIds: ['source-1', 'source-2', 'source-3'],
      metadata: {
        provider: 'bedrock-kb',
        query: 'agentra runtime policy',
        synthesizer: 'kb-answer-synthesis-v1',
      },
    });
    expect(output.metadata).toMatchObject({
      flow: 'kb-answer-flow-v1',
      requestId: 'req-1',
      status: 'answer_ready',
      sourceCount: 3,
      citationCount: 3,
      synthesizer: 'kb-answer-synthesis-v1',
    });
  });

  it('returns no_results when the retrieval produced no sources', async () => {
    const { synthesizeKbAnswer } = await import('../../rag/kb-answer-synthesis.js');

    const output = synthesizeKbAnswer({
      flow: {
        status: 'answer_ready',
        retrieval: {
          ...buildRetrieval({
            sources: [],
            citations: [],
            brief: {
              id: 'brief-empty',
              createdAt: '2026-05-09T00:00:00.000Z',
              language: 'en' as const,
              outputFormat: 'report' as const,
              topic: 'Runtime policy',
              goal: 'Summarize KB evidence',
              openQuestions: ['No relevant knowledge base chunks were retrieved for this query.'],
              sourceIds: [],
              metadata: {
                provider: 'bedrock-kb',
                noResults: true,
              },
            },
            rawResultSummary: {
              resultCount: 0,
              originalResultCount: 2,
              noResults: true,
            },
          }) as never,
        },
      },
      createBrief: false,
    });

    expect(output.status).toBe('no_results');
    expect(output.caveats).toContain('No knowledge base sources were retrieved.');
    expect(output.caveats).toContain('No citations were available.');
    expect(output.keyFindings).toEqual([]);
    expect(output.brief).toBeUndefined();
  });

  it('maps readiness failures without requiring retrieval data', async () => {
    const { synthesizeKbAnswer } = await import('../../rag/kb-answer-synthesis.js');

    const notConfigured = synthesizeKbAnswer({
      flow: { status: 'not_configured' },
      createBrief: false,
    });
    const fallbackRecommended = synthesizeKbAnswer({
      flow: { status: 'fallback_recommended' },
      createBrief: false,
    });

    expect(notConfigured.status).toBe('not_configured');
    expect(notConfigured.nextActions[0]).toContain('diagnostics');
    expect(fallbackRecommended.status).toBe('fallback_recommended');
    expect(fallbackRecommended.caveats).toContain(
      'Knowledge base retrieval was not ready; fallback may be needed.',
    );
  });

  it('marks sparse or low-score retrievals as weak evidence', async () => {
    const { synthesizeKbAnswer } = await import('../../rag/kb-answer-synthesis.js');

    const output = synthesizeKbAnswer({
      flow: {
        status: 'answer_ready',
        retrieval: {
          ...buildRetrieval({
            sources: [
              {
                id: 'source-1',
                type: 'document' as const,
                title: 'Low confidence',
                snippet: 'Low confidence chunk.',
                retrievedAt: '2026-05-09T00:00:00.000Z',
                score: 0.2,
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
            brief: undefined,
            rawResultSummary: {
              resultCount: 1,
              originalResultCount: 1,
            },
          }) as never,
        },
      },
      createBrief: false,
    });

    expect(output.status).toBe('weak_evidence');
    expect(output.caveats).toContain('Retrieved evidence may be insufficient.');
    expect(output.keyFindings).toEqual(['Low confidence chunk.']);
  });
});
