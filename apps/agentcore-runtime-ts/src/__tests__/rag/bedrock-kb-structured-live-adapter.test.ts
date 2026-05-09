import { describe, expect, it, vi } from 'vitest';

describe('bedrock kb structured live adapter', () => {
  it('returns not implemented when required config is missing', async () => {
    const {
      createBedrockKbStructuredLiveAdapter,
      createBedrockKbStructuredLiveAdapterRequest,
    } = await import('../../rag/bedrock-kb-structured-live-adapter.js');

    const adapter = createBedrockKbStructuredLiveAdapter({
      region: 'ap-northeast-1',
    });

    const request = createBedrockKbStructuredLiveAdapterRequest({
      plan: {
        id: 'plan-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
      region: 'ap-northeast-1',
      executionMode: 'live',
      dryRun: false,
    });

    const rawResult = await adapter.execute(request);

    expect(rawResult.status).toBe('not_implemented');
    expect(rawResult.message).toContain('missing knowledge base id');
  });

  it('maps structured row content into a retrieval request and response', async () => {
    const {
      createBedrockKbStructuredLiveAdapter,
      createBedrockKbStructuredLiveAdapterRequest,
    } = await import('../../rag/bedrock-kb-structured-live-adapter.js');

    const send = vi.fn(async () => ({
      retrievalResults: [
        {
          content: {
            type: 'ROW',
            text: 'Structured rows for line A',
            row: [
              {
                columnName: 'lineId',
                columnValue: 'line-a',
                type: 'STRING',
              },
              {
                columnName: 'count',
                columnValue: '7',
                type: 'STRING',
              },
            ],
          },
          location: {
            type: 'SQL',
            sqlLocation: {
              query: 'SELECT * FROM ignored_by_adapter',
            },
          },
          score: 0.93,
        },
      ],
    }));

    const adapter = createBedrockKbStructuredLiveAdapter({
      client: { send },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
    });

    const request = createBedrockKbStructuredLiveAdapterRequest({
      plan: {
        id: 'plan-2',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        targetEntity: 'line-a',
        timeRange: {
          start: '2026-05-01',
          end: '2026-05-08',
          timezone: 'Asia/Tokyo',
        },
        filters: [
          {
            field: 'lineId',
            operator: 'equals',
            value: 'line-a',
          },
        ],
        metrics: ['count'],
        groupBy: ['lineId'],
        orderBy: [
          {
            field: 'count',
            direction: 'desc',
          },
        ],
        limit: 3,
        confidence: 0.95,
      },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
      dataSourceName: 'structured-facts',
      executionMode: 'live',
      dryRun: false,
    });

    const rawResult = await adapter.execute(request);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input?: { retrievalQuery?: { text?: string } };
    };
    expect(command.input?.retrievalQuery?.text).toContain(
      'Question: Show KPI aggregation for line A',
    );
    expect(command.input?.retrievalQuery?.text).toContain('Intent: kpi_aggregation');
    expect(command.input?.retrievalQuery?.text).toContain(
      'Time range: start=2026-05-01, end=2026-05-08, timezone=Asia/Tokyo',
    );
    expect(command.input?.retrievalQuery?.text).toContain('Metrics: count');
    expect(command.input?.retrievalQuery?.text).toContain('Group by: lineId');
    expect(command.input?.retrievalQuery?.text).toContain('Order by: count desc');
    expect(command.input?.retrievalQuery?.text).toContain('Filters:');
    expect(command.input?.retrievalQuery?.text).toContain('- lineId equals line-a');
    expect(rawResult).toMatchObject({
      status: 'success',
      rows: [
        {
          lineId: 'line-a',
          count: '7',
        },
      ],
      message: 'Structured rows for line A',
    });
    expect(rawResult.rawProviderResponse).toMatchObject({
      responseType: 'object',
      rowCount: 1,
      previewRowCount: 1,
    });
  });

  it('returns an empty raw result when no structured rows are present', async () => {
    const {
      createBedrockKbStructuredLiveAdapter,
      createBedrockKbStructuredLiveAdapterRequest,
    } = await import('../../rag/bedrock-kb-structured-live-adapter.js');

    const adapter = createBedrockKbStructuredLiveAdapter({
      client: {
        send: vi.fn(async () => ({
          retrievalResults: [
            {
              content: {
                type: 'TEXT',
                text: 'No structured rows were returned.',
              },
            },
          ],
        })),
      },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
    });

    const rawResult = await adapter.execute(
      createBedrockKbStructuredLiveAdapterRequest({
        plan: {
          id: 'plan-3',
          createdAt: '2026-05-09T00:00:00.000Z',
          intent: 'generic_lookup',
          dataSourceKind: 'bedrock_kb_structured',
          question: 'What is available?',
          confidence: 0.6,
        },
        knowledgeBaseId: 'kb-123',
        region: 'ap-northeast-1',
        executionMode: 'live',
        dryRun: false,
      }),
    );

    expect(rawResult.status).toBe('empty');
    expect(rawResult.rows).toHaveLength(0);
    expect(rawResult.message).toBe('No structured rows were returned.');
  });

  it('maps client errors into a safe error raw result', async () => {
    const {
      createBedrockKbStructuredLiveAdapter,
      createBedrockKbStructuredLiveAdapterRequest,
    } = await import('../../rag/bedrock-kb-structured-live-adapter.js');

    const adapter = createBedrockKbStructuredLiveAdapter({
      client: {
        send: vi.fn(async () => {
          throw new Error('AccessDenied');
        }),
      },
      knowledgeBaseId: 'kb-123',
      region: 'ap-northeast-1',
    });

    const rawResult = await adapter.execute(
      createBedrockKbStructuredLiveAdapterRequest({
        plan: {
          id: 'plan-4',
          createdAt: '2026-05-09T00:00:00.000Z',
          intent: 'generic_lookup',
          dataSourceKind: 'bedrock_kb_structured',
          question: 'What is available?',
          confidence: 0.6,
        },
        knowledgeBaseId: 'kb-123',
        region: 'ap-northeast-1',
        executionMode: 'live',
        dryRun: false,
      }),
    );

    expect(rawResult.status).toBe('error');
    expect(rawResult.rows).toHaveLength(0);
    expect(rawResult.message).toBe('AccessDenied');
  });
});
