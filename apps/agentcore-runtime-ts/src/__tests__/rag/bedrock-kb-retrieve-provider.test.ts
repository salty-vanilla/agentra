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
    expect(output.rawResultSummary).toEqual({ resultCount: 1 });
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
    expect(output.rawResultSummary).toEqual({ resultCount: 1 });
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
    expect(output.rawResultSummary).toEqual({ resultCount: 0 });
  });
});
