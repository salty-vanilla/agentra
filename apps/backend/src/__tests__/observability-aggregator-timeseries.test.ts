import type { ObservabilityRecord } from '@agentra/shared';
import { describe, expect, it } from 'vitest';
import { aggregateByTimeBucket } from '../lib/observability-aggregator.js';

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

describe('aggregateByTimeBucket — day bucket', () => {
  it('returns empty array for no records', () => {
    expect(aggregateByTimeBucket([], 'day')).toEqual([]);
  });

  it('groups records on the same day into one bucket', () => {
    const records = [
      makeRecord({ startedAt: '2026-05-23T08:00:00.000Z', durationMs: 100 }),
      makeRecord({ startedAt: '2026-05-23T14:30:00.000Z', durationMs: 300 }),
      makeRecord({ startedAt: '2026-05-23T23:59:59.000Z', durationMs: 200 }),
    ];
    const result = aggregateByTimeBucket(records, 'day');
    expect(result).toHaveLength(1);
    expect(result[0].bucketStart).toBe('2026-05-23T00:00:00.000Z');
    expect(result[0].requestCount).toBe(3);
  });

  it('produces separate buckets for different days, sorted ascending', () => {
    const records = [
      makeRecord({ startedAt: '2026-05-25T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-05-23T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-05-24T10:00:00.000Z' }),
    ];
    const result = aggregateByTimeBucket(records, 'day');
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.bucketStart)).toEqual([
      '2026-05-23T00:00:00.000Z',
      '2026-05-24T00:00:00.000Z',
      '2026-05-25T00:00:00.000Z',
    ]);
  });

  it('counts statuses correctly within a bucket', () => {
    const records = [
      makeRecord({ status: 'success' }),
      makeRecord({ status: 'error' }),
      makeRecord({ status: 'cancelled' }),
      makeRecord({ status: 'success' }),
    ];
    const [bucket] = aggregateByTimeBucket(records, 'day');
    expect(bucket.requestCount).toBe(4);
    expect(bucket.successCount).toBe(2);
    expect(bucket.errorCount).toBe(1);
    expect(bucket.cancelledCount).toBe(1);
  });

  it('computes avgDurationMs and p95DurationMs for a bucket', () => {
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const records = durations.map((durationMs) => makeRecord({ durationMs }));
    const [bucket] = aggregateByTimeBucket(records, 'day');
    expect(bucket.avgDurationMs).toBe(550);
    expect(bucket.p95DurationMs).toBe(1000);
  });

  it('sums token fields from tokenUsage', () => {
    const records = [
      makeRecord({
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
      makeRecord({
        tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
      }),
    ];
    const [bucket] = aggregateByTimeBucket(records, 'day');
    expect(bucket.inputTokens).toBe(300);
    expect(bucket.outputTokens).toBe(150);
    expect(bucket.totalTokens).toBe(450);
  });

  it('sums toolCallCount and toolFailureCount', () => {
    const records = [
      makeRecord({ toolCallCount: 3, toolFailureCount: 1 }),
      makeRecord({ toolCallCount: 5, toolFailureCount: 2 }),
    ];
    const [bucket] = aggregateByTimeBucket(records, 'day');
    expect(bucket.toolCallCount).toBe(8);
    expect(bucket.toolFailureCount).toBe(3);
  });

  it('handles records without tokenUsage gracefully', () => {
    const records = [makeRecord(), makeRecord()];
    const [bucket] = aggregateByTimeBucket(records, 'day');
    expect(bucket.totalTokens).toBe(0);
    expect(bucket.inputTokens).toBe(0);
    expect(bucket.outputTokens).toBe(0);
  });
});

describe('aggregateByTimeBucket — hour bucket', () => {
  it('groups records in the same hour into one bucket', () => {
    const records = [
      makeRecord({ startedAt: '2026-05-23T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-05-23T10:45:00.000Z' }),
      makeRecord({ startedAt: '2026-05-23T10:59:59.000Z' }),
    ];
    const result = aggregateByTimeBucket(records, 'hour');
    expect(result).toHaveLength(1);
    expect(result[0].bucketStart).toBe('2026-05-23T10:00:00.000Z');
    expect(result[0].requestCount).toBe(3);
  });

  it('produces separate buckets for different hours', () => {
    const records = [
      makeRecord({ startedAt: '2026-05-23T10:30:00.000Z' }),
      makeRecord({ startedAt: '2026-05-23T11:00:00.000Z' }),
      makeRecord({ startedAt: '2026-05-23T12:00:00.000Z' }),
    ];
    const result = aggregateByTimeBucket(records, 'hour');
    expect(result).toHaveLength(3);
    expect(result[0].bucketStart).toBe('2026-05-23T10:00:00.000Z');
    expect(result[1].bucketStart).toBe('2026-05-23T11:00:00.000Z');
    expect(result[2].bucketStart).toBe('2026-05-23T12:00:00.000Z');
  });

  it('treats midnight boundary correctly (23:59 vs 00:00 next day)', () => {
    const records = [
      makeRecord({ startedAt: '2026-05-23T23:30:00.000Z' }),
      makeRecord({ startedAt: '2026-05-24T00:10:00.000Z' }),
    ];
    const result = aggregateByTimeBucket(records, 'hour');
    expect(result).toHaveLength(2);
    expect(result[0].bucketStart).toBe('2026-05-23T23:00:00.000Z');
    expect(result[1].bucketStart).toBe('2026-05-24T00:00:00.000Z');
  });
});

describe('aggregateByTimeBucket — edge cases', () => {
  it('handles a single record', () => {
    const records = [makeRecord({ durationMs: 42 })];
    const result = aggregateByTimeBucket(records, 'day');
    expect(result).toHaveLength(1);
    expect(result[0].requestCount).toBe(1);
    expect(result[0].avgDurationMs).toBe(42);
    expect(result[0].p95DurationMs).toBe(42);
  });
});
