import { describe, expect, it, vi } from 'vitest';

describe('structured query executor', () => {
  it('delegates execution to the provider', async () => {
    const { StructuredQueryExecutor } = await import(
      '../../rag/structured-query-executor.js'
    );

    const provider = {
      kind: 'mock' as const,
      execute: vi.fn().mockResolvedValue({
        plan: {
          id: 'plan-1',
          createdAt: '2026-05-07T00:00:00.000Z',
          intent: 'unknown',
          dataSourceKind: 'mock',
          question: 'Test query',
          confidence: 0.5,
        },
        status: 'empty' as const,
        rows: [],
        summary: {
          status: 'empty' as const,
          rowCount: 0,
          columnNames: [],
          dataSourceKind: 'mock' as const,
          intent: 'unknown' as const,
          dryRun: true,
        },
        sources: [],
        citations: [],
      }),
    };

    const executor = new StructuredQueryExecutor(provider);
    const input = {
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-07T00:00:00.000Z',
        intent: 'unknown' as const,
        dataSourceKind: 'mock' as const,
        question: 'Test query',
        confidence: 0.5,
      },
      dryRun: true,
      createBrief: false,
    };

    const output = await executor.execute(input);

    expect(provider.execute).toHaveBeenCalledWith(input);
    expect(output.status).toBe('empty');
  });
});
