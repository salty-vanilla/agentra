import type { ObservabilityRecord } from '@agentra/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamoObservabilityStore } from '../store/observability-store.js';

const { sendMock } = vi.hoisted(() => {
  const sendMock = vi.fn();
  return { sendMock };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: sendMock })),
  },
  PutCommand: vi.fn((input: unknown) => ({ input })),
  QueryCommand: vi.fn((input: unknown) => ({ input })),
}));

const TABLE = 'test-observability-table';

const baseRecord: ObservabilityRecord = {
  traceId: 'trace-001',
  requestId: 'req-001',
  threadId: 'thread-001',
  userId: 'user-001',
  startedAt: '2026-01-15T10:00:00.000Z',
  completedAt: '2026-01-15T10:00:05.000Z',
  durationMs: 5000,
  status: 'success',
  toolCalls: [],
  agentCalls: [],
  skillCalls: [],
  toolCallCount: 0,
  toolFailureCount: 0,
  agentCallCount: 0,
  skillCallCount: 0,
  createdAt: '2026-01-15T10:00:05.000Z',
  schemaVersion: 1,
};

describe('DynamoObservabilityStore', () => {
  beforeEach(() => {
    process.env.OBSERVABILITY_TABLE_NAME = TABLE;
    sendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.OBSERVABILITY_TABLE_NAME;
  });

  describe('putObservabilityRecord', () => {
    it('calls PutCommand with correct pk/sk and all GSI keys', async () => {
      sendMock.mockResolvedValue({});
      const store = new DynamoObservabilityStore();
      await store.putObservabilityRecord(baseRecord);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [cmd] = sendMock.mock.calls[0] as [
        { input: { TableName: string; Item: Record<string, unknown> } },
      ];
      const { Item, TableName } = cmd.input;

      expect(TableName).toBe(TABLE);
      expect(Item.pk).toBe('USER#user-001');
      expect(Item.sk).toBe('2026-01-15T10:00:00.000Z#trace-001');
      expect(Item.gsi1pk).toBe('TRACE#trace-001');
      expect(Item.gsi1sk).toBe('RECORD');
      expect(Item.gsi2pk).toBe('DAY#2026-01-15');
      expect(Item.gsi2sk).toBe('2026-01-15T10:00:00.000Z#USER#user-001');
      expect(Item.gsi3pk).toBe('THREAD#thread-001');
      expect(Item.gsi3sk).toBe('2026-01-15T10:00:00.000Z#trace-001');
    });

    it('preserves record fields in PutCommand Item', async () => {
      sendMock.mockResolvedValue({});
      const store = new DynamoObservabilityStore();
      await store.putObservabilityRecord(baseRecord);

      const [cmd] = sendMock.mock.calls[0] as [
        { input: { Item: Record<string, unknown> } },
      ];
      expect(cmd.input.Item.traceId).toBe('trace-001');
      expect(cmd.input.Item.status).toBe('success');
      expect(cmd.input.Item.durationMs).toBe(5000);
    });
  });

  describe('getObservabilityRecordByTraceId', () => {
    it('queries gsi1-index with correct KeyConditionExpression', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...baseRecord }] });
      const store = new DynamoObservabilityStore();
      await store.getObservabilityRecordByTraceId('trace-001');

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.IndexName).toBe('gsi1-index');
      expect(cmd.input.KeyConditionExpression).toBe('gsi1pk = :pk AND gsi1sk = :sk');
      const vals = cmd.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(vals[':pk']).toBe('TRACE#trace-001');
      expect(vals[':sk']).toBe('RECORD');
    });

    it('returns the parsed record when found', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...baseRecord }] });
      const store = new DynamoObservabilityStore();
      const result = await store.getObservabilityRecordByTraceId('trace-001');

      expect(result).toBeDefined();
      expect(result?.traceId).toBe('trace-001');
      expect(result?.status).toBe('success');
    });

    it('returns undefined when no item found', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      const result = await store.getObservabilityRecordByTraceId('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('listObservabilityRecordsByUser', () => {
    it('queries the main table with pk = USER#{userId}', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      await store.listObservabilityRecordsByUser('user-001');

      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.IndexName).toBeUndefined();
      expect(cmd.input.KeyConditionExpression).toBe('pk = :pk');
      const vals = cmd.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(vals[':pk']).toBe('USER#user-001');
    });

    it('adds BETWEEN condition when startDay and endDay are both provided', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      await store.listObservabilityRecordsByUser('user-001', {
        startDay: '2026-01-01',
        endDay: '2026-01-31',
      });

      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.KeyConditionExpression).toContain('BETWEEN');
      const vals = cmd.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(vals[':start']).toBe('2026-01-01');
      expect(vals[':end']).toBe('2026-01-31T99:99:99.999Z');
    });

    it('uses ScanIndexForward=false for reverse-chronological order', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      await store.listObservabilityRecordsByUser('user-001');

      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.ScanIndexForward).toBe(false);
    });
  });

  describe('listObservabilityRecordsByDay', () => {
    it('queries gsi2-index with gsi2pk = DAY#{day}', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      await store.listObservabilityRecordsByDay('2026-01-15');

      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.IndexName).toBe('gsi2-index');
      expect(cmd.input.KeyConditionExpression).toBe('gsi2pk = :pk');
      const vals = cmd.input.ExpressionAttributeValues as Record<string, unknown>;
      expect(vals[':pk']).toBe('DAY#2026-01-15');
    });
  });

  describe('cursor encode/decode', () => {
    it('encodes LastEvaluatedKey as base64 JSON cursor', async () => {
      const lastKey = { pk: 'USER#user-001', sk: '2026-01-15T10:00:00.000Z#trace-001' };
      sendMock.mockResolvedValue({ Items: [], LastEvaluatedKey: lastKey });
      const store = new DynamoObservabilityStore();
      const result = await store.listObservabilityRecordsByUser('user-001');

      expect(result.cursor).toBeDefined();
      const decoded = JSON.parse(
        Buffer.from(result.cursor as string, 'base64').toString(),
      );
      expect(decoded).toEqual(lastKey);
    });

    it('passes decoded cursor as ExclusiveStartKey on next page call', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      const lastKey = { pk: 'USER#user-001', sk: '2026-01-15T10:00:00.000Z#trace-001' };
      const cursor = Buffer.from(JSON.stringify(lastKey)).toString('base64');

      await store.listObservabilityRecordsByUser('user-001', undefined, { cursor });

      const [cmd] = sendMock.mock.calls[0] as [{ input: Record<string, unknown> }];
      expect(cmd.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('omits cursor when LastEvaluatedKey is absent', async () => {
      sendMock.mockResolvedValue({ Items: [] });
      const store = new DynamoObservabilityStore();
      const result = await store.listObservabilityRecordsByUser('user-001');
      expect(result.cursor).toBeUndefined();
    });
  });
});
