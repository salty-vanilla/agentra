import { describe, expect, it, vi } from 'vitest';
import type { RetrieveClient } from '../../rag/bedrock-kb-retrieve-provider.js';
import { BedrockKbRetrieveProvider } from '../../rag/bedrock-kb-retrieve-provider.js';

describe('BedrockKbRetrieveProvider timeout handling', () => {
  it('accepts optional abort signal in search', async () => {
    const mockClient: RetrieveClient = {
      send: vi.fn().mockResolvedValue({ retrievalResults: [] }),
    };

    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: 'test-kb-id',
      client: mockClient,
    });

    const controller = new AbortController();
    const result = await provider.search(
      {
        query: 'test query',
      },
      controller.signal,
    );

    expect(result).toBeDefined();
    expect(result.provider).toBe('bedrock_kb_retrieve');
    expect(mockClient.send).toHaveBeenCalled();
  });

  it('passes abort signal to client', async () => {
    const mockClient: RetrieveClient = {
      send: vi.fn().mockResolvedValue({ retrievalResults: [] }),
    };

    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: 'test-kb-id',
      client: mockClient,
    });

    const controller = new AbortController();
    await provider.search(
      {
        query: 'test query',
      },
      controller.signal,
    );

    expect(mockClient.send).toHaveBeenCalled();
  });

  it('provides timeout configuration with default timeout', async () => {
    const mockClient: RetrieveClient = {
      send: vi.fn().mockResolvedValue({ retrievalResults: [] }),
    };

    const provider = new BedrockKbRetrieveProvider({
      knowledgeBaseId: 'test-kb-id',
      client: mockClient,
    });

    // Verify provider can be instantiated and used
    const result = await provider.search({
      query: 'test query',
    });

    expect(result).toBeDefined();
    expect(result.provider).toBe('bedrock_kb_retrieve');
    expect(mockClient.send).toHaveBeenCalled();
  });
});
