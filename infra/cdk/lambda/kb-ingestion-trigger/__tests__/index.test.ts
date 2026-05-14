import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-bedrock-agent', () => {
  class BedrockAgentClient {
    send = mockSend;
  }
  class ListIngestionJobsCommand {
    _type = 'ListIngestionJobsCommand';
    constructor(public input: unknown) {}
  }
  class StartIngestionJobCommand {
    _type = 'StartIngestionJobCommand';
    constructor(public input: unknown) {}
  }
  return { BedrockAgentClient, ListIngestionJobsCommand, StartIngestionJobCommand };
});

const makeEvent = (messageIds: string[]): SQSEvent => ({
  Records: messageIds.map((id) => ({
    messageId: id,
    receiptHandle: `receipt-${id}`,
    body: '{}',
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '0',
      SenderId: 'test',
      ApproximateFirstReceiveTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123:test-queue',
    awsRegion: 'us-east-1',
  })),
});

describe('kb-ingestion-trigger handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KB_ID = 'kb-test-id';
    process.env.DATA_SOURCE_ID = 'ds-test-id';
  });

  it('starts ingestion and returns no failures when no job is in progress', async () => {
    mockSend
      .mockResolvedValueOnce({ ingestionJobSummaries: [] })
      .mockResolvedValueOnce({ ingestionJob: { ingestionJobId: 'job-123' } });

    const { handler } = await import('../index.js');
    const result = await handler(makeEvent(['msg-1', 'msg-2']));

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('requeues all messages when an ingestion job is already in progress', async () => {
    mockSend.mockResolvedValueOnce({
      ingestionJobSummaries: [{ ingestionJobId: 'running-job' }],
    });

    const { handler } = await import('../index.js');
    const result = await handler(makeEvent(['msg-1', 'msg-2', 'msg-3']));

    expect(result.batchItemFailures).toHaveLength(3);
    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([
      'msg-1',
      'msg-2',
      'msg-3',
    ]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('does not start a second ingestion when a job is in progress', async () => {
    mockSend.mockResolvedValueOnce({
      ingestionJobSummaries: [{ ingestionJobId: 'running-job' }],
    });

    const { handler } = await import('../index.js');
    await handler(makeEvent(['msg-1']));

    const calls = mockSend.mock.calls.map((c) => c[0]._type);
    expect(calls).toEqual(['ListIngestionJobsCommand']);
    expect(calls).not.toContain('StartIngestionJobCommand');
  });

  it('handles an empty SQS batch without crashing', async () => {
    mockSend
      .mockResolvedValueOnce({ ingestionJobSummaries: [] })
      .mockResolvedValueOnce({ ingestionJob: { ingestionJobId: 'job-empty' } });

    const { handler } = await import('../index.js');
    const result = await handler(makeEvent([]));

    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('propagates Bedrock API errors so SQS retries the batch', async () => {
    mockSend.mockRejectedValueOnce(new Error('Bedrock throttled'));

    const { handler } = await import('../index.js');
    await expect(handler(makeEvent(['msg-1']))).rejects.toThrow('Bedrock throttled');
  });
});
