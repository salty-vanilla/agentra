import type { DeckPreviewEvent } from '@agentra/shared';
import { describe, expect, it } from 'vitest';
import { type RunPresentationTool, streamPresentation } from './stream-presentation.js';

const okResult = {
  success: true as const,
  summary: 'done',
  workDir: '/w',
  artifacts: [],
  warnings: [],
};

const startedEvent: DeckPreviewEvent = {
  type: 'deck_preview_started',
  deckId: 'd1',
  name: 'Demo',
  totalSlides: 2,
};
const slideEvent: DeckPreviewEvent = {
  type: 'deck_slide_compose_ready',
  deckId: 'd1',
  slug: 'slide-1',
  index: 1,
  totalSlides: 2,
  composeUrl: null,
  defsUrl: null,
  previewUrl: null,
};

async function drain<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe('streamPresentation', () => {
  it('yields each deck event as a deck_progress message, then the final result', async () => {
    const runTool: RunPresentationTool = async (_req, opts) => {
      opts.onDeckEvent(startedEvent);
      opts.onDeckEvent(slideEvent);
      return okResult;
    };

    const messages = await drain(streamPresentation({ prompt: 'hi' }, { runTool }));

    expect(messages.map((m) => m.data.type)).toEqual([
      'deck_progress',
      'deck_progress',
      'result',
    ]);
    const first = messages[0]!;
    expect(first.data.type === 'deck_progress' && first.data.event).toEqual(startedEvent);
    const last = messages.at(-1);
    expect(last?.data.type === 'result' && last.data.result.success).toBe(true);
  });

  it('still yields a result message when the tool emits no deck events', async () => {
    const runTool: RunPresentationTool = async () => okResult;
    const messages = await drain(streamPresentation({ prompt: 'hi' }, { runTool }));
    expect(messages.map((m) => m.data.type)).toEqual(['result']);
  });

  it('degrades to a failure result message when the tool throws', async () => {
    const runTool: RunPresentationTool = async () => {
      throw new Error('boom');
    };
    const messages = await drain(streamPresentation({ prompt: 'hi' }, { runTool }));
    expect(messages).toHaveLength(1);
    const only = messages[0]!;
    expect(only.data.type).toBe('result');
    expect(only.data.type === 'result' && only.data.result.success).toBe(false);
    expect(only.data.type === 'result' && only.data.result.error?.message).toContain(
      'boom',
    );
  });

  it('forwards deck events that arrive before the tool resolves, in order', async () => {
    const runTool: RunPresentationTool = async (_req, opts) => {
      opts.onDeckEvent(startedEvent);
      await Promise.resolve();
      opts.onDeckEvent(slideEvent);
      return okResult;
    };
    const messages = await drain(streamPresentation({ prompt: 'hi' }, { runTool }));
    const deckEvents = messages
      .filter((m) => m.data.type === 'deck_progress')
      .map((m) => (m.data.type === 'deck_progress' ? m.data.event.type : ''));
    expect(deckEvents).toEqual(['deck_preview_started', 'deck_slide_compose_ready']);
  });
});
