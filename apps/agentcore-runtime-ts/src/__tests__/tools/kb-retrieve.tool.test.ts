import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('kb retrieve tool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

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
    expect(output.rawResultSummary).toEqual({
      resultCount: 1,
      originalResultCount: 1,
    });
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
    expect(output.rawResultSummary).toEqual({
      resultCount: 1,
      originalResultCount: 1,
    });
  });

  it('resolves input from env defaults', async () => {
    vi.stubEnv('BEDROCK_KB_ID', 'kb-from-env');
    vi.stubEnv('BEDROCK_KB_DEFAULT_TOP_K', '7');

    const { resolveKbRetrieveInput } = await import('../../tools/kb-retrieve.tool.js');

    expect(
      resolveKbRetrieveInput({
        query: '  runtime policy  ',
        briefTopic: '  topic  ',
        briefGoal: '  goal  ',
      }),
    ).toMatchObject({
      query: 'runtime policy',
      knowledgeBaseId: 'kb-from-env',
      topK: 7,
      createBrief: true,
      briefTopic: 'topic',
      briefGoal: 'goal',
      language: 'unknown',
    });
  });

  it('accepts valid metadata filters and query rewrite hints', async () => {
    const { resolveKbRetrieveInput } = await import('../../tools/kb-retrieve.tool.js');

    expect(
      resolveKbRetrieveInput({
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        metadataFilter: {
          andAll: [
            {
              key: 'project',
              operator: 'equals',
              value: 'agentra',
            },
          ],
        },
        scoreThreshold: 0.5,
        queryRewriteHint: 'expand with deployment terms',
      }),
    ).toMatchObject({
      query: 'runtime policy',
      knowledgeBaseId: 'kb-123',
      metadataFilter: {
        andAll: [
          {
            key: 'project',
            operator: 'equals',
            value: 'agentra',
          },
        ],
      },
      scoreThreshold: 0.5,
      queryRewriteHint: 'expand with deployment terms',
    });
  });

  it('rejects invalid metadata filter sizes and query rewrite hints', async () => {
    const { resolveKbRetrieveInput } = await import('../../tools/kb-retrieve.tool.js');

    expect(() =>
      resolveKbRetrieveInput({
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        metadataFilter: {
          andAll: Array.from({ length: 21 }, (_, index) => ({
            key: `k${index}`,
            operator: 'equals',
            value: 'v',
          })),
        },
      }),
    ).toThrow(/metadataFilter must not exceed 20 total conditions/);

    expect(() =>
      resolveKbRetrieveInput({
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        scoreThreshold: 1.5,
      }),
    ).toThrow(/scoreThreshold must be between 0 and 1/);

    expect(() =>
      resolveKbRetrieveInput({
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        queryRewriteHint: 'x'.repeat(1001),
      }),
    ).toThrow(/queryRewriteHint must not exceed 1000 characters/);
  });

  it('returns an error when the knowledge base id is missing', async () => {
    const { executeKbRetrieveTool } = await import('../../tools/kb-retrieve.tool.js');

    const response = await executeKbRetrieveTool({
      query: 'runtime policy',
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain(
      'knowledgeBaseId must be provided or BEDROCK_KB_ID must be set',
    );
  });
});
