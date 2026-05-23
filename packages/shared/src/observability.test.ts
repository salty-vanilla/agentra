import { describe, expect, it } from 'vitest';
import type { ChatObservationSummary } from './chat.js';
import {
  normalizeObservabilityRecord,
  observabilityRecordSchema,
  sanitizeMetadata,
} from './observability.js';

const baseSummary: ChatObservationSummary = {
  traceId: 'trace-001',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:05.000Z',
  durationMs: 5000,
  status: 'success',
  toolCalls: [],
  toolCallCount: 0,
  toolFailureCount: 0,
};

const baseInput = {
  summary: baseSummary,
  requestId: 'req-001',
  threadId: 'thread-001',
  userId: 'user-001',
};

describe('normalizeObservabilityRecord', () => {
  it('builds a valid record for a successful request', () => {
    const record = normalizeObservabilityRecord(baseInput);

    expect(record.traceId).toBe('trace-001');
    expect(record.requestId).toBe('req-001');
    expect(record.threadId).toBe('thread-001');
    expect(record.userId).toBe('user-001');
    expect(record.status).toBe('success');
    expect(record.durationMs).toBe(5000);
    expect(record.toolCalls).toHaveLength(0);
    expect(record.agentCalls).toHaveLength(0);
    expect(record.skillCalls).toHaveLength(0);
    expect(record.toolCallCount).toBe(0);
    expect(record.toolFailureCount).toBe(0);
    expect(record.agentCallCount).toBe(0);
    expect(record.skillCallCount).toBe(0);
    expect(record.schemaVersion).toBe(1);
    expect(record.createdAt).toBeTruthy();
  });

  it('sets status to error correctly', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: { ...baseSummary, status: 'error' },
    });

    expect(record.status).toBe('error');
  });

  it('sets status to cancelled correctly', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: { ...baseSummary, status: 'cancelled' },
    });

    expect(record.status).toBe('cancelled');
  });

  it('includes tokenUsage when present', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
    });

    expect(record.tokenUsage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
  });

  it('omits tokenUsage when absent', () => {
    const record = normalizeObservabilityRecord(baseInput);
    expect(record.tokenUsage).toBeUndefined();
  });

  it('includes model and modelKey when provided', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      model: 'us.anthropic.claude-sonnet-4-6-20260101-v1:0',
      modelKey: 'sonnet',
    });

    expect(record.model).toBe('us.anthropic.claude-sonnet-4-6-20260101-v1:0');
    expect(record.modelKey).toBe('sonnet');
  });

  it('includes assistantMessageId when provided', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      assistantMessageId: 'msg-123',
    });

    expect(record.assistantMessageId).toBe('msg-123');
  });

  it('omits assistantMessageId when not provided', () => {
    const record = normalizeObservabilityRecord(baseInput);
    expect(record.assistantMessageId).toBeUndefined();
  });

  it('maps tool calls correctly', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'web_search',
            startedAt: '2026-01-01T00:00:01.000Z',
            completedAt: '2026-01-01T00:00:02.000Z',
            durationMs: 1000,
            status: 'success',
          },
          {
            toolCallId: 'tc-2',
            toolName: 'code_run',
            startedAt: '2026-01-01T00:00:02.000Z',
            durationMs: 500,
            status: 'error',
            error: 'timeout',
          },
        ],
        toolCallCount: 2,
        toolFailureCount: 1,
      },
    });

    expect(record.toolCalls).toHaveLength(2);
    const [tc0, tc1] = record.toolCalls;
    expect(tc0?.toolName).toBe('web_search');
    expect(tc0?.status).toBe('success');
    expect(tc1?.toolName).toBe('code_run');
    expect(tc1?.status).toBe('error');
    expect(tc1?.error).toBe('timeout');
    expect(record.toolCallCount).toBe(2);
    expect(record.toolFailureCount).toBe(1);
  });

  it('produces a record that passes schema validation', () => {
    const record = normalizeObservabilityRecord({
      ...baseInput,
      summary: {
        ...baseSummary,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'search',
            startedAt: '2026-01-01T00:00:01.000Z',
            completedAt: '2026-01-01T00:00:02.000Z',
            durationMs: 1000,
            status: 'success',
          },
        ],
        toolCallCount: 1,
        toolFailureCount: 0,
      },
      model: 'claude-sonnet',
      modelKey: 'sonnet',
      assistantMessageId: 'msg-xyz',
    });

    const result = observabilityRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });
});

describe('sanitizeMetadata', () => {
  it('redacts token keys', () => {
    const result = sanitizeMetadata({ token: 'abc123', name: 'test' });
    expect(result.token).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('redacts secret keys', () => {
    const result = sanitizeMetadata({ secret: 'mysecret' });
    expect(result.secret).toBe('[REDACTED]');
  });

  it('redacts password keys', () => {
    const result = sanitizeMetadata({ password: 'p@ssw0rd' });
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts authorization keys', () => {
    const result = sanitizeMetadata({ authorization: 'Bearer xyz' });
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('redacts api_key keys (with underscore)', () => {
    const result = sanitizeMetadata({ api_key: 'key123' });
    expect(result.api_key).toBe('[REDACTED]');
  });

  it('redacts apiKey keys (camelCase)', () => {
    const result = sanitizeMetadata({ apiKey: 'key456' });
    expect(result.apiKey).toBe('[REDACTED]');
  });

  it('preserves non-sensitive keys', () => {
    const result = sanitizeMetadata({ toolName: 'search', durationMs: 100, ok: true });
    expect(result.toolName).toBe('search');
    expect(result.durationMs).toBe(100);
    expect(result.ok).toBe(true);
  });

  it('returns empty object for empty input', () => {
    const result = sanitizeMetadata({});
    expect(result).toEqual({});
  });
});
