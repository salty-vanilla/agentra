import { RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { describe, expect, it, vi } from 'vitest';

describe('bedrock kb retrieve provider', () => {
  it('builds sources, citations, and a brief from retrieve results', async () => {
    const { buildBedrockKbRetrieveOutput } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const output = buildBedrockKbRetrieveOutput(
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
              provider: 'kb-metadata-provider',
              knowledgeBaseId: 'kb-metadata-id',
            },
            score: 0.93,
          },
        ],
      },
    );

    expect(output.provider).toBe('bedrock_kb_retrieve');
    expect(output.query).toBe('agentra runtime policy');
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
    expect(output.metadata).toEqual({
      provider: 'bedrock-kb',
      knowledgeBaseId: 'kb-123',
      query: 'agentra runtime policy',
    });
  });

  it('omits the brief when createBrief is false', async () => {
    const { buildBedrockKbRetrieveOutput } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const output = buildBedrockKbRetrieveOutput(
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

  it('filters low-score results and keeps score-less results', async () => {
    const { buildBedrockKbRetrieveOutput } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const output = buildBedrockKbRetrieveOutput(
      {
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        topK: 5,
        createBrief: true,
        language: 'en',
        scoreThreshold: 0.5,
      },
      {
        retrievalResults: [
          {
            content: { text: 'High score chunk.' },
            metadata: { source: 'high.md' },
            score: 0.9,
          },
          {
            content: { text: 'Low score chunk.' },
            metadata: { source: 'low.md' },
            score: 0.4,
          },
          {
            content: { text: 'No score chunk.' },
            metadata: { source: 'unknown.md' },
          },
        ],
      },
    );

    expect(output.sources).toHaveLength(2);
    expect(output.sources.map((source) => source.snippet)).toEqual([
      'High score chunk.',
      'No score chunk.',
    ]);
    expect(output.rawResultSummary).toEqual({
      resultCount: 2,
      originalResultCount: 3,
      filteredByScoreCount: 1,
    });
  });

  it('returns an explicit no-results brief when score filtering removes everything', async () => {
    const { buildBedrockKbRetrieveOutput } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const output = buildBedrockKbRetrieveOutput(
      {
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        topK: 5,
        createBrief: true,
        briefTopic: 'Policy',
        briefGoal: 'Summarize evidence',
        language: 'en',
        scoreThreshold: 0.9,
      },
      {
        retrievalResults: [
          {
            content: { text: 'Low score chunk.' },
            metadata: { source: 'low.md' },
            score: 0.4,
          },
          {
            content: { text: 'Lower score chunk.' },
            metadata: { source: 'lower.md' },
            score: 0.1,
          },
        ],
      },
    );

    expect(output.sources).toEqual([]);
    expect(output.citations).toEqual([]);
    expect(output.rawResultSummary).toEqual({
      resultCount: 0,
      originalResultCount: 2,
      filteredByScoreCount: 2,
      noResults: true,
    });
    expect(output.metadata).toMatchObject({
      provider: 'bedrock-kb',
      knowledgeBaseId: 'kb-123',
      query: 'runtime policy',
      noResults: true,
    });
    expect(output.brief).toMatchObject({
      topic: 'Policy',
      goal: 'Summarize evidence',
      sourceIds: [],
      metadata: {
        provider: 'bedrock-kb',
        knowledgeBaseId: 'kb-123',
        query: 'runtime policy',
        noResults: true,
      },
      openQuestions: ['No relevant knowledge base chunks were retrieved for this query.'],
    });
  });

  it('preserves metadata overrides from the knowledge base chunks', async () => {
    const { buildBedrockKbRetrieveOutput } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const output = buildBedrockKbRetrieveOutput(
      {
        query: 'runtime policy',
        knowledgeBaseId: 'kb-123',
        topK: 5,
        createBrief: false,
        language: 'unknown',
      },
      {
        retrievalResults: [
          {
            content: { text: 'Chunk with conflicting metadata.' },
            metadata: {
              provider: 'bad',
              knowledgeBaseId: 'bad',
              source: 'conflict.md',
            },
          },
        ],
      },
    );

    expect(output.sources[0]?.metadata).toMatchObject({
      provider: 'bedrock-kb',
      knowledgeBaseId: 'kb-123',
      source: 'conflict.md',
    });
  });

  it('includes query rewrite hint metadata without changing the retrieval query', async () => {
    const send = vi.fn().mockResolvedValue({
      retrievalResults: [],
    });

    const { BedrockKbRetrieveProvider } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: 'kb-123',
      client: { send },
    });

    const output = await provider.search({
      query: 'hello world',
      metadataFilter: {
        andAll: [
          {
            key: 'project',
            operator: 'equals',
            value: 'agentra',
          },
        ],
      },
      queryRewriteHint: 'expand with deployment terminology',
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(RetrieveCommand);
    expect(command.input).toMatchObject({
      retrievalQuery: {
        text: 'hello world',
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          filter: {
            andAll: [
              {
                equals: {
                  key: 'project',
                  value: 'agentra',
                },
              },
            ],
          },
        },
      },
    });
    expect(output.metadata).toMatchObject({
      queryRewriteHint: 'expand with deployment terminology',
    });
  });

  it('converts metadata filters into Bedrock retrieval filters', async () => {
    const { toBedrockRetrievalFilter } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    expect(
      toBedrockRetrievalFilter({
        andAll: [
          {
            key: 'project',
            operator: 'equals',
            value: 'agentra',
          },
        ],
      }),
    ).toEqual({
      andAll: [
        {
          equals: {
            key: 'project',
            value: 'agentra',
          },
        },
      ],
    });

    expect(
      toBedrockRetrievalFilter({
        orAll: [
          {
            key: 'docType',
            operator: 'in',
            value: ['policy', 'notes'],
          },
        ],
      }),
    ).toEqual({
      orAll: [
        {
          in: {
            key: 'docType',
            value: ['policy', 'notes'],
          },
        },
      ],
    });

    expect(
      toBedrockRetrievalFilter({
        andAll: [
          {
            key: 'project',
            operator: 'equals',
            value: 'agentra',
          },
        ],
        orAll: [
          {
            key: 'source',
            operator: 'starts_with',
            value: 'kb-',
          },
        ],
      }),
    ).toEqual({
      andAll: [
        {
          andAll: [
            {
              equals: {
                key: 'project',
                value: 'agentra',
              },
            },
          ],
        },
        {
          orAll: [
            {
              startsWith: {
                key: 'source',
                value: 'kb-',
              },
            },
          ],
        },
      ],
    });
  });

  it('uses the injected client and builds a RetrieveCommand', async () => {
    const send = vi.fn().mockResolvedValue({
      retrievalResults: [],
    });

    const { BedrockKbRetrieveProvider } = await import(
      '../../rag/bedrock-kb-retrieve-provider.js'
    );

    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: 'kb-123',
      client: { send },
    });

    const output = await provider.search({
      query: 'hello world',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(RetrieveCommand);
    expect(command.input).toMatchObject({
      knowledgeBaseId: 'kb-123',
      retrievalQuery: {
        text: 'hello world',
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: 5,
        },
      },
    });
    expect(output.rawResultSummary).toEqual({
      resultCount: 0,
      originalResultCount: 0,
      noResults: true,
    });
  });
});
