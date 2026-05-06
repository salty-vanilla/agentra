import {
  chatStreamErrorEventSchema,
  chatStreamEventSchema,
  chatStreamProgressSummaryEventSchema,
} from '@agentra/shared';
import { describe, expect, it } from 'vitest';

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

  it('accepts progress_summary wrapper events', () => {
    const result = chatStreamProgressSummaryEventSchema.safeParse({
      type: 'progress_summary',
      event: {
        type: 'progress_summary',
        phase: 'router_handoff',
        title: '資料を作成しています',
        summary: 'Presentation Author エージェントに委譲しました。',
        timestamp: '2026-05-07T00:00:00.000Z',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts error events with observabilitySummary', () => {
    const result = chatStreamErrorEventSchema.safeParse({
      type: 'error',
      error: 'Agent invocation failed. traceId=trace_123',
      observabilitySummary,
    });

    expect(result.success).toBe(true);
  });

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
        observabilitySummary,
      }).success,
    ).toBe(true);
  });
});
