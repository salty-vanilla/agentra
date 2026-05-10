import { persistedChatMessageSchema, threadSummarySchema } from '@agentra/shared';
import { describe, expect, it } from 'vitest';

const validThread = {
  threadId: 'thread-abc',
  title: 'My Thread',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

const validMessage = {
  messageId: 'msg-123',
  threadId: 'thread-abc',
  role: 'user' as const,
  content: 'Hello',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const validObservabilitySummary = {
  traceId: 'trace-001',
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: '2024-01-01T00:00:01.000Z',
  durationMs: 1000,
  status: 'success' as const,
  toolCalls: [],
  toolCallCount: 0,
  toolFailureCount: 0,
};

describe('threadSummarySchema', () => {
  it('accepts a valid thread record', () => {
    const result = threadSummarySchema.safeParse(validThread);
    expect(result.success).toBe(true);
  });

  it('accepts a thread with optional preview', () => {
    const result = threadSummarySchema.safeParse({
      ...validThread,
      preview: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a thread without preview', () => {
    const result = threadSummarySchema.safeParse(validThread);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preview).toBeUndefined();
    }
  });

  it('rejects a record missing threadId', () => {
    const { threadId: _, ...rest } = validThread;
    const result = threadSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a record missing title', () => {
    const { title: _, ...rest } = validThread;
    const result = threadSummarySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a record with invalid createdAt datetime', () => {
    const result = threadSummarySchema.safeParse({
      ...validThread,
      createdAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a record with invalid updatedAt datetime', () => {
    const result = threadSummarySchema.safeParse({ ...validThread, updatedAt: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object', () => {
    const result = threadSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('persistedChatMessageSchema', () => {
  it('accepts a valid message without observabilitySummary', () => {
    const result = persistedChatMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it('accepts a valid assistant message', () => {
    const result = persistedChatMessageSchema.safeParse({
      ...validMessage,
      role: 'assistant',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a message with a valid observabilitySummary', () => {
    const result = persistedChatMessageSchema.safeParse({
      ...validMessage,
      observabilitySummary: validObservabilitySummary,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a record missing messageId', () => {
    const { messageId: _, ...rest } = validMessage;
    const result = persistedChatMessageSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a record with invalid role', () => {
    const result = persistedChatMessageSchema.safeParse({
      ...validMessage,
      role: 'system',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a record missing content', () => {
    const { content: _, ...rest } = validMessage;
    const result = persistedChatMessageSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a record with invalid createdAt datetime', () => {
    const result = persistedChatMessageSchema.safeParse({
      ...validMessage,
      createdAt: 'oops',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message with a malformed observabilitySummary', () => {
    const result = persistedChatMessageSchema.safeParse({
      ...validMessage,
      observabilitySummary: { traceId: 'x', status: 'unknown' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object', () => {
    const result = persistedChatMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
