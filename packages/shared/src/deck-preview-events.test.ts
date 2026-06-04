import { describe, expect, it } from 'vitest';
import type { DeckResult } from './artifacts.js';
import {
  buildDeckPreviewEvents,
  type DeckPreviewEvent,
  deckPreviewEventSchema,
} from './deck-preview-events.js';

function makeDeck(overrides: Partial<DeckResult> = {}): DeckResult {
  return {
    deckId: 'deck-1',
    name: '四半期レビュー',
    language: 'ja',
    slideOrder: ['cover', 'agenda', 'summary'],
    defsUrl: 'https://example.com/defs.json',
    pptxDownloadUrl: 'https://example.com/deck.pptx',
    specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
    slides: [
      { slug: 'cover', previewUrl: null, composeUrl: 'https://example.com/cover.json' },
      { slug: 'agenda', previewUrl: null, composeUrl: 'https://example.com/agenda.json' },
      {
        slug: 'summary',
        previewUrl: null,
        composeUrl: 'https://example.com/summary.json',
      },
    ],
    version: 1,
    ...overrides,
  };
}

describe('deckPreviewEventSchema', () => {
  it('accepts each event variant', () => {
    const samples: DeckPreviewEvent[] = [
      { type: 'deck_preview_started', deckId: 'd', name: 'n', totalSlides: 3 },
      {
        type: 'deck_slide_compose_ready',
        deckId: 'd',
        slug: 'cover',
        index: 1,
        totalSlides: 3,
        composeUrl: 'https://example.com/c.json',
        defsUrl: 'https://example.com/defs.json',
        previewUrl: null,
      },
      { type: 'deck_preview_completed', deckId: 'd', totalSlides: 3 },
      { type: 'deck_preview_failed', deckId: 'd', reason: 'compose failed' },
    ];
    for (const sample of samples) {
      expect(deckPreviewEventSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('rejects an unknown event type', () => {
    expect(
      deckPreviewEventSchema.safeParse({ type: 'deck_unknown', deckId: 'd' }).success,
    ).toBe(false);
  });

  it('rejects a 0-based slide index', () => {
    expect(
      deckPreviewEventSchema.safeParse({
        type: 'deck_slide_compose_ready',
        deckId: 'd',
        slug: 'cover',
        index: 0,
        composeUrl: null,
        defsUrl: null,
        previewUrl: null,
      }).success,
    ).toBe(false);
  });
});

describe('buildDeckPreviewEvents', () => {
  it('emits started → one compose_ready per slide (1-based, ordered) → completed', () => {
    const events = buildDeckPreviewEvents(makeDeck());

    expect(events.map((e) => e.type)).toEqual([
      'deck_preview_started',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_slide_compose_ready',
      'deck_preview_completed',
    ]);

    const started = events[0];
    expect(started).toMatchObject({
      deckId: 'deck-1',
      name: '四半期レビュー',
      totalSlides: 3,
    });

    const slideEvents = events.filter(
      (e): e is Extract<DeckPreviewEvent, { type: 'deck_slide_compose_ready' }> =>
        e.type === 'deck_slide_compose_ready',
    );
    expect(slideEvents.map((e) => e.index)).toEqual([1, 2, 3]);
    expect(slideEvents.map((e) => e.slug)).toEqual(['cover', 'agenda', 'summary']);
    expect(slideEvents[0]?.defsUrl).toBe('https://example.com/defs.json');
    expect(slideEvents[0]?.composeUrl).toBe('https://example.com/cover.json');

    expect(events.at(-1)).toMatchObject({
      type: 'deck_preview_completed',
      totalSlides: 3,
    });
  });

  it('follows slideOrder even when slides array is unordered, and degrades missing compose to null', () => {
    const deck = makeDeck({
      slideOrder: ['summary', 'cover'],
      slides: [
        { slug: 'cover', previewUrl: null, composeUrl: 'https://example.com/cover.json' },
        // summary slide intentionally absent from slides[] → composeUrl null
      ],
    });

    const slideEvents = buildDeckPreviewEvents(deck).filter(
      (e): e is Extract<DeckPreviewEvent, { type: 'deck_slide_compose_ready' }> =>
        e.type === 'deck_slide_compose_ready',
    );

    expect(slideEvents.map((e) => e.slug)).toEqual(['summary', 'cover']);
    expect(slideEvents[0]?.composeUrl).toBeNull();
    expect(slideEvents[1]?.composeUrl).toBe('https://example.com/cover.json');
  });

  it('produces only schema-valid events', () => {
    for (const event of buildDeckPreviewEvents(makeDeck())) {
      expect(deckPreviewEventSchema.safeParse(event).success).toBe(true);
    }
  });
});
