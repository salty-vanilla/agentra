import { describe, expect, it, vi } from 'vitest';

describe('rag service', () => {
  it('delegates search to the provider', async () => {
    const search = vi.fn().mockResolvedValue({
      query: 'hello',
      provider: 'unknown',
      sources: [],
      citations: [],
      rawResultSummary: { resultCount: 0 },
    });

    const { RagService } = await import('../../rag/rag-service.js');

    const service = new RagService({
      kind: 'unknown',
      search,
    });

    await expect(service.search({ query: 'hello' })).resolves.toMatchObject({
      query: 'hello',
      rawResultSummary: { resultCount: 0 },
    });
    expect(search).toHaveBeenCalledWith({ query: 'hello' });
  });
});
