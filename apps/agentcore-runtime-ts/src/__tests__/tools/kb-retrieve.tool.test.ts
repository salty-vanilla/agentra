import { describe, expect, it } from 'vitest';

describe('kb retrieve tool', () => {
  it('builds sources, citations, and a brief from Bedrock KB retrieve results', async () => {
    const { buildKbRetrieveOutput } = await import('../../tools/kb-retrieve.tool.js');

    const output = buildKbRetrieveOutput(
      {
        query: 'agentra runtime policy',
        knowledgeBaseId: 'kb-123',
        topK: 5,
        createBrief: true,
        briefTopic: 'Runtime policy',
        briefGoal: 'Summarize KB evidence',
        language: 'en',
      },
      {
        retrievalResults: [
          {
            content: {
              text: '  First internal policy chunk.  ',
            },
            location: {
              s3Location: {
                uri: 's3://agentra-docs/policy.md',
              },
            },
            metadata: {
              title: 'Policy document',
              department: 'engineering',
            },
            score: 0.93,
          },
        ],
      },
    );

    expect(output.query).toBe('agentra runtime policy');
    expect(output.knowledgeBaseId).toBe('kb-123');
    expect(output.sources).toHaveLength(1);
    expect(output.sources[0]).toMatchObject({
      type: 'document',
      title: 'Policy document',
      uri: 's3://agentra-docs/policy.md',
      snippet: 'First internal policy chunk.',
      score: 0.93,
      metadata: {
        provider: 'bedrock-kb',
        knowledgeBaseId: 'kb-123',
        department: 'engineering',
      },
    });
    expect(output.citations).toHaveLength(1);
    expect(output.citations[0]).toMatchObject({
      label: '[1]',
      sourceId: output.sources[0]?.id,
      type: 'document',
      title: 'Policy document',
      uri: 's3://agentra-docs/policy.md',
    });
    expect(output.brief).toMatchObject({
      language: 'en',
      outputFormat: 'report',
      topic: 'Runtime policy',
      goal: 'Summarize KB evidence',
      sourceIds: output.sources.map((source) => source.id),
      metadata: {
        provider: 'bedrock-kb',
        knowledgeBaseId: 'kb-123',
        query: 'agentra runtime policy',
      },
    });
    expect(output.brief?.keyFacts).toEqual(['First internal policy chunk.']);
    expect(output.rawResultSummary).toEqual({ resultCount: 1 });
  });

  it('omits the brief when createBrief is false', async () => {
    const { buildKbRetrieveOutput } = await import('../../tools/kb-retrieve.tool.js');

    const output = buildKbRetrieveOutput(
      {
        query: 'deployment notes',
        knowledgeBaseId: 'kb-123',
        topK: 3,
        createBrief: false,
        language: 'unknown',
      },
      {
        retrievalResults: [
          {
            content: {
              text: 'Deployment note chunk.',
            },
            metadata: {
              source: 'deployment.md',
            },
          },
        ],
      },
    );

    expect(output.brief).toBeUndefined();
    expect(output.sources).toHaveLength(1);
    expect(output.citations).toHaveLength(1);
    expect(output.rawResultSummary).toEqual({ resultCount: 1 });
  });
});
