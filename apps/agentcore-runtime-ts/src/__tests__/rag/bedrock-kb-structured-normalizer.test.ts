import { describe, expect, it } from 'vitest';

describe('bedrock kb structured normalizer', () => {
  it('builds a stub request and preserves input metadata without overwriting provider fields', async () => {
    const { buildBedrockKbStructuredRequest } = await import(
      '../../rag/bedrock-kb-structured-normalizer.js'
    );

    const request = buildBedrockKbStructuredRequest({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      metadata: {
        provider: 'input-provider',
        planId: 'input-plan',
        executionMode: 'live',
        custom: 'value',
      },
    });

    expect(request.executionMode).toBe('stub');
    expect(request.dryRun).toBe(true);
    expect(request.metadata).toMatchObject({
      provider: 'bedrock-kb-structured-provider',
      planId: 'plan-1',
      executionMode: 'stub',
      custom: 'value',
    });
    expect(request.knowledgeBaseId).toBe('kb-123');
    expect(request.region).toBe('ap-northeast-1');
    expect(request.dataSourceName).toBe('structured-facts');
  });

  it('returns a consistent not implemented raw result', async () => {
    const {
      buildBedrockKbStructuredRequest,
      createNotImplementedBedrockKbStructuredRawResult,
    } = await import('../../rag/bedrock-kb-structured-normalizer.js');

    const request = buildBedrockKbStructuredRequest({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'unknown',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'What is available?',
        confidence: 0.1,
      },
    });

    const rawResult = createNotImplementedBedrockKbStructuredRawResult(request);

    expect(rawResult).toMatchObject({
      status: 'not_implemented',
      rows: [],
      message: 'Bedrock KB structured provider is not implemented yet.',
      metadata: {
        provider: 'bedrock-kb-structured-provider',
        planId: 'plan-2',
        executionMode: 'stub',
      },
    });
  });

  it('normalizes rows, sources, citations, brief, and truncation metadata', async () => {
    const { buildBedrockKbStructuredRequest, normalizeBedrockKbStructuredResult } =
      await import('../../rag/bedrock-kb-structured-normalizer.js');

    const request = buildBedrockKbStructuredRequest({
      plan: {
        id: 'plan-3',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'production_trend',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show the production trend',
        confidence: 0.88,
      },
      metadata: {
        provider: 'input-provider',
      },
    });

    const rawResult = {
      status: 'success' as const,
      rows: [
        {
          b: 2,
          a: 1,
          valid: 'yes',
          bool: true,
          nil: null,
          nested: { nope: true },
          func: () => 'skip',
          inf: Number.POSITIVE_INFINITY,
        },
        'skip-me',
        {
          a: 3,
          c: false,
        },
      ],
      metadata: {
        provider: 'raw-provider',
        source: 'raw',
      },
    };

    const output = normalizeBedrockKbStructuredResult({
      request,
      rawResult: rawResult as never,
    });

    expect(output.status).toBe('success');
    expect(output.rows).toEqual([
      { b: 2, a: 1, valid: 'yes', bool: true, nil: null },
      { a: 3, c: false },
    ]);
    expect(output.summary).toMatchObject({
      status: 'success',
      rowCount: 2,
      columnNames: ['b', 'a', 'valid', 'bool', 'nil', 'c'],
      dataSourceKind: 'bedrock_kb_structured',
      intent: 'production_trend',
      dryRun: true,
    });
    expect(output.sources).toHaveLength(1);
    expect(output.citations).toHaveLength(1);
    expect(output.metadata).toMatchObject({
      provider: 'bedrock-kb-structured-provider',
      planId: 'plan-3',
      executionMode: 'stub',
      source: 'raw',
    });
    expect(output.metadata).not.toHaveProperty('provider', 'raw-provider');
    expect(output.brief).toMatchObject({
      topic: 'Show the production trend',
      goal: 'Summarize structured query execution results.',
      keyFacts: ['Structured query returned 2 rows.'],
    });
  });

  it('marks truncation when more than 1000 rows are provided', async () => {
    const { buildBedrockKbStructuredRequest, normalizeBedrockKbStructuredResult } =
      await import('../../rag/bedrock-kb-structured-normalizer.js');

    const request = buildBedrockKbStructuredRequest({
      plan: {
        id: 'plan-4',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for the last 1001 batches',
        confidence: 0.9,
      },
    });

    const rawResult = {
      status: 'success' as const,
      rows: Array.from({ length: 1001 }, (_, index) => ({ index })),
    };

    const output = normalizeBedrockKbStructuredResult({
      request,
      rawResult: rawResult as never,
    });

    expect(output.rows).toHaveLength(1000);
    expect(output.summary.rowCount).toBe(1000);
    expect(output.metadata).toMatchObject({
      truncated: true,
      originalRowCount: 1001,
    });
    expect(output.brief).toMatchObject({
      keyFacts: ['Structured query returned 1000 rows.'],
    });
  });

  it('omits the brief when createBrief is false', async () => {
    const { buildBedrockKbStructuredRequest, normalizeBedrockKbStructuredResult } =
      await import('../../rag/bedrock-kb-structured-normalizer.js');

    const request = buildBedrockKbStructuredRequest({
      plan: {
        id: 'plan-5',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'unknown',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'What is available?',
        confidence: 0.1,
      },
    });

    const output = normalizeBedrockKbStructuredResult({
      request,
      rawResult: {
        status: 'not_implemented',
        rows: [],
        message: 'Bedrock KB structured provider is not implemented yet.',
      } as never,
      createBrief: false,
    });

    expect(output.brief).toBeUndefined();
    expect(output.summary.message).toBe(
      'Bedrock KB structured provider is not implemented yet.',
    );
  });
});
