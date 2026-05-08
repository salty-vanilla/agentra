import { describe, expect, it } from 'vitest';
import { chatStreamEventSchema } from '../lib/chat-stream.js';

describe('chat stream contract', () => {
  const observabilitySummary = {
    traceId: 'trace_123',
    startedAt: '2026-05-07T00:00:00.000Z',
    completedAt: '2026-05-07T00:00:05.000Z',
    durationMs: 5000,
    status: 'error' as const,
    toolCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
  };

  it('treats the shared stream union as the canonical wire format', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'progress_summary',
        event: {
          type: 'progress_summary',
          phase: 'outline',
          title: '構成を検討しています',
          summary: '章立てを整理しています。',
          details: ['表紙', '要約'],
          timestamp: '2026-05-07T00:00:00.000Z',
        },
      }).success,
    ).toBe(true);

    expect(
      chatStreamEventSchema.safeParse({
        type: 'error',
        error: 'Agent invocation failed. traceId=trace_123',
        observabilitySummary: {
          ...observabilitySummary,
          toolCalls: [
            {
              toolCallId: 'tool-use-123',
              toolName: 'search_web',
              startedAt: '2026-05-07T00:00:01.000Z',
              completedAt: '2026-05-07T00:00:03.000Z',
              durationMs: 2000,
              status: 'success',
            },
          ],
          toolCallCount: 1,
        },
      }).success,
    ).toBe(true);
  });
});
