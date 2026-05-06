import { describe, expect, it } from 'vitest';

describe('web research tool', () => {
  it('builds sources, citations, and a brief from tavily-like results', async () => {
    const { buildWebResearchOutput } = await import('../../tools/web-research.tool.js');

    const output = buildWebResearchOutput(
      {
        query: '  agentic rag  ',
        maxResults: 5,
        createBrief: true,
        briefTopic: 'Agentic RAG',
        briefGoal: 'Summarize research',
        language: 'en',
      },
      {
        answer: '  Agentic RAG combines retrieval and tool use.  ',
        results: [
          {
            title: 'First result',
            url: 'https://example.com/1',
            raw_content: '  Short raw content from the first page.  ',
            score: 0.98,
          },
          {
            title: 'Second result',
            url: 'https://example.com/2',
            content: '  Content from the second page.  ',
            score: 0.7,
          },
        ],
      },
    );

    expect(output.query).toBe('agentic rag');
    expect(output.answer).toBe('Agentic RAG combines retrieval and tool use.');
    expect(output.sources).toHaveLength(2);
    expect(output.sources[0]).toMatchObject({
      type: 'web',
      title: 'First result',
      url: 'https://example.com/1',
      snippet: 'Short raw content from the first page.',
      score: 0.98,
      metadata: { provider: 'tavily', query: 'agentic rag' },
    });
    expect(output.citations).toHaveLength(2);
    expect(output.citations[0]).toMatchObject({
      label: '[1]',
      sourceId: output.sources[0]?.id,
      type: 'web',
    });
    expect(output.brief).toMatchObject({
      language: 'en',
      outputFormat: 'report',
      topic: 'Agentic RAG',
      goal: 'Summarize research',
      sourceIds: output.sources.map((source) => source.id),
      metadata: { provider: 'tavily', query: 'agentic rag' },
    });
    expect(output.brief?.keyFacts?.[0]).toBe(
      'Agentic RAG combines retrieval and tool use.',
    );
    expect(output.rawResultSummary).toEqual({
      resultCount: 2,
      hasAnswer: true,
      hasRawContent: true,
    });
  });

  it('omits the brief when createBrief is false', async () => {
    const { buildWebResearchOutput } = await import('../../tools/web-research.tool.js');

    const output = buildWebResearchOutput(
      {
        query: 'web research',
        createBrief: false,
      },
      {
        results: [
          {
            title: 'Only result',
            url: 'https://example.com',
            content: 'Some content',
          },
        ],
      },
    );

    expect(output.brief).toBeUndefined();
    expect(output.citations).toHaveLength(1);
    expect(output.rawResultSummary).toEqual({
      resultCount: 1,
      hasAnswer: false,
      hasRawContent: false,
    });
  });
});
