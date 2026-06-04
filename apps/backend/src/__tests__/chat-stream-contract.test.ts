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
        type: 'sub_agent_progress',
        event: {
          type: 'sub_agent_progress',
          stage: 'kb_retrieve',
          status: 'complete',
          durationMs: 1200,
          timestamp: '2026-05-07T00:00:02.000Z',
        },
      }).success,
    ).toBe(true);

    expect(
      chatStreamEventSchema.safeParse({
        type: 'error',
        requestId: 'req-123',
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

  it('accepts thread_started event with threadId', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'thread_started',
        threadId: 'thread-abc-123',
      }).success,
    ).toBe(true);
  });

  it('rejects thread_started event without threadId', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'thread_started',
      }).success,
    ).toBe(false);
  });

  it('accepts error event with optional threadId', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'error',
        requestId: 'req-abc-123',
        threadId: 'thread-abc-123',
        error: 'Agent invocation failed.',
      }).success,
    ).toBe(true);
  });

  it('accepts error event without threadId (backward compatibility)', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'error',
        requestId: 'req-def-456',
        error: 'Agent invocation failed.',
      }).success,
    ).toBe(true);
  });

  it('accepts done event with required threadId', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'done',
        threadId: 'thread-abc-123',
        requestId: 'req-abc-123',
        model: 'claude-sonnet-4-6',
        createdAt: '2026-05-07T00:00:05.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts artifact event with valid manifest', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'artifact',
        manifest: {
          id: 'manifest-001',
          createdAt: '2026-05-07T00:00:00.000Z',
          artifacts: [
            {
              id: 'artifact-001',
              kind: 'pptx',
              name: 'presentation.pptx',
              createdAt: '2026-05-07T00:00:00.000Z',
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects artifact event when manifest id is missing', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'artifact',
        manifest: {
          createdAt: '2026-05-07T00:00:00.000Z',
          artifacts: [],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts deck_progress wrapping each deck preview event variant', () => {
    const events = [
      {
        type: 'deck_preview_started',
        deckId: 'deck-1',
        name: '四半期レビュー',
        totalSlides: 3,
      },
      {
        type: 'deck_slide_compose_ready',
        deckId: 'deck-1',
        slug: 'cover',
        index: 1,
        totalSlides: 3,
        composeUrl: 'https://example.com/cover.json',
        defsUrl: 'https://example.com/defs.json',
        previewUrl: null,
      },
      { type: 'deck_preview_completed', deckId: 'deck-1', totalSlides: 3 },
      { type: 'deck_preview_failed', deckId: 'deck-1', reason: 'compose failed' },
    ];
    for (const event of events) {
      expect(
        chatStreamEventSchema.safeParse({ type: 'deck_progress', event }).success,
      ).toBe(true);
    }
  });

  it('rejects deck_progress with an unknown inner event type', () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: 'deck_progress',
        event: { type: 'deck_bogus', deckId: 'deck-1' },
      }).success,
    ).toBe(false);
  });
});
