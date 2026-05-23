import type { ObservabilityRecord } from '@agentra/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryObservabilityStore } from '../store/observability-store.js';

function makeRecord(overrides: Partial<ObservabilityRecord> = {}): ObservabilityRecord {
  return {
    traceId: 'trace-001',
    requestId: 'req-001',
    threadId: 'thread-001',
    userId: 'user-001',
    startedAt: '2026-05-23T10:00:00.000Z',
    completedAt: '2026-05-23T10:00:05.000Z',
    durationMs: 5000,
    status: 'success',
    toolCalls: [],
    agentCalls: [],
    skillCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    createdAt: '2026-05-23T10:00:05.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

describe('MemoryObservabilityStore', () => {
  let store: MemoryObservabilityStore;

  beforeEach(() => {
    store = new MemoryObservabilityStore();
  });

  describe('putObservabilityRecord + getObservabilityRecordByTraceId', () => {
    it('retrieves a record by traceId after putting it', async () => {
      const record = makeRecord({ traceId: 'trace-abc' });
      await store.putObservabilityRecord(record);

      const found = await store.getObservabilityRecordByTraceId('trace-abc');
      expect(found).toBeDefined();
      expect(found?.traceId).toBe('trace-abc');
    });

    it('returns undefined for unknown traceId', async () => {
      const found = await store.getObservabilityRecordByTraceId('unknown');
      expect(found).toBeUndefined();
    });

    it('stores a success record correctly', async () => {
      const record = makeRecord({ status: 'success' });
      await store.putObservabilityRecord(record);

      const found = await store.getObservabilityRecordByTraceId(record.traceId);
      expect(found?.status).toBe('success');
    });

    it('stores an error record correctly', async () => {
      const record = makeRecord({ traceId: 'trace-err', status: 'error' });
      await store.putObservabilityRecord(record);

      const found = await store.getObservabilityRecordByTraceId('trace-err');
      expect(found?.status).toBe('error');
    });

    it('stores a cancelled record correctly', async () => {
      const record = makeRecord({ traceId: 'trace-cancel', status: 'cancelled' });
      await store.putObservabilityRecord(record);

      const found = await store.getObservabilityRecordByTraceId('trace-cancel');
      expect(found?.status).toBe('cancelled');
    });
  });

  describe('listObservabilityRecordsByUser', () => {
    it('returns records for the given userId', async () => {
      await store.putObservabilityRecord(makeRecord({ traceId: 't1', userId: 'user-A' }));
      await store.putObservabilityRecord(makeRecord({ traceId: 't2', userId: 'user-B' }));

      const result = await store.listObservabilityRecordsByUser('user-A');
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.userId).toBe('user-A');
    });

    it('returns empty when no records match userId', async () => {
      const result = await store.listObservabilityRecordsByUser('nobody');
      expect(result.records).toHaveLength(0);
      expect(result.cursor).toBeUndefined();
    });

    it('filters by startDay', async () => {
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          startedAt: '2026-05-20T10:00:00.000Z',
          completedAt: '2026-05-20T10:00:05.000Z',
        }),
      );
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't2',
          startedAt: '2026-05-23T10:00:00.000Z',
          completedAt: '2026-05-23T10:00:05.000Z',
        }),
      );

      const result = await store.listObservabilityRecordsByUser('user-001', {
        startDay: '2026-05-22',
      });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.traceId).toBe('t2');
    });

    it('filters by endDay', async () => {
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          startedAt: '2026-05-20T10:00:00.000Z',
          completedAt: '2026-05-20T10:00:05.000Z',
        }),
      );
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't2',
          startedAt: '2026-05-23T10:00:00.000Z',
          completedAt: '2026-05-23T10:00:05.000Z',
        }),
      );

      const result = await store.listObservabilityRecordsByUser('user-001', {
        endDay: '2026-05-21',
      });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.traceId).toBe('t1');
    });

    it('returns cursor when more records exist', async () => {
      for (let i = 0; i < 5; i++) {
        await store.putObservabilityRecord(makeRecord({ traceId: `t${i}` }));
      }

      const result = await store.listObservabilityRecordsByUser('user-001', undefined, {
        limit: 2,
      });
      expect(result.records).toHaveLength(2);
      expect(result.cursor).toBeDefined();
    });

    it('paginates through all records', async () => {
      for (let i = 0; i < 5; i++) {
        await store.putObservabilityRecord(makeRecord({ traceId: `t${i}` }));
      }

      const page1 = await store.listObservabilityRecordsByUser('user-001', undefined, {
        limit: 3,
      });
      expect(page1.records).toHaveLength(3);
      expect(page1.cursor).toBeDefined();

      const page2 = await store.listObservabilityRecordsByUser('user-001', undefined, {
        limit: 3,
        ...(page1.cursor ? { cursor: page1.cursor } : {}),
      });
      expect(page2.records).toHaveLength(2);
      expect(page2.cursor).toBeUndefined();
    });
  });

  describe('listObservabilityRecordsByDay', () => {
    it('returns records matching the given day', async () => {
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          startedAt: '2026-05-23T08:00:00.000Z',
          completedAt: '2026-05-23T08:00:01.000Z',
        }),
      );
      await store.putObservabilityRecord(
        makeRecord({
          traceId: 't2',
          startedAt: '2026-05-24T08:00:00.000Z',
          completedAt: '2026-05-24T08:00:01.000Z',
        }),
      );

      const result = await store.listObservabilityRecordsByDay('2026-05-23');
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.traceId).toBe('t1');
    });

    it('returns empty when no records match the day', async () => {
      const result = await store.listObservabilityRecordsByDay('2099-01-01');
      expect(result.records).toHaveLength(0);
    });
  });
});
