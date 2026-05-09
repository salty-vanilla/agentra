import { describe, expect, it } from 'vitest';

function buildFlow() {
  return {
    status: 'answer_ready' as const,
    retrieval: {
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
        {
          id: 'source-2',
          type: 'document' as const,
          title: 'Runbook',
          snippet: 'Second internal runbook chunk.',
          retrievedAt: '2026-05-09T00:00:00.000Z',
          score: 0.82,
        },
        {
          id: 'source-3',
          type: 'document' as const,
          title: 'Reference',
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
        },
        {
          id: 'citation-2',
          label: '[2]',
          sourceId: 'source-2',
          type: 'document' as const,
        },
        {
          id: 'citation-3',
          label: '[3]',
          sourceId: 'source-3',
          type: 'document' as const,
        },
      ],
      rawResultSummary: {
        resultCount: 3,
        originalResultCount: 3,
      },
      metadata: {
        provider: 'bedrock-kb',
        knowledgeBaseId: 'kb-123',
      },
    },
    metadata: {
      flow: 'kb-answer-flow-v1',
    },
  };
}

describe('kb answer synthesis tool', () => {
  function parseToolResponse(response: {
    status: string;
    content: Array<{ text: string }>;
  }) {
    return JSON.parse(response.content[0]?.text ?? '{}');
  }

  it('returns a successful synthesized answer payload', async () => {
    const { executeKbAnswerSynthesisTool } = await import(
      '../../tools/kb-answer-synthesis.tool.js'
    );

    const response = executeKbAnswerSynthesisTool({
      flow: buildFlow(),
      includeSourcePreview: true,
      maxSources: 2,
      createBrief: true,
      metadata: { requestId: 'req-1' },
    });

    const parsed = parseToolResponse(response);

    expect(response.status).toBe('success');
    expect(parsed.status).toBe('answer_ready');
    expect(parsed.sourcePreview).toHaveLength(2);
    expect(parsed.metadata.synthesizer).toBe('kb-answer-synthesis-v1');
  });

  it('returns an error for an invalid flow status', async () => {
    const { executeKbAnswerSynthesisTool } = await import(
      '../../tools/kb-answer-synthesis.tool.js'
    );

    const response = executeKbAnswerSynthesisTool({
      flow: {
        ...(buildFlow() as Record<string, unknown>),
        status: 'bogus' as unknown,
      } as never,
      createBrief: false,
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('Invalid option');
  });
});
