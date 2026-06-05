import { describe, expect, it } from 'vitest';
import {
  deckStreamReducer,
  initialDeckStreamState,
  isStreamingDeckActive,
  mergeSnapshotIntoDeckState,
  reduceDeckStream,
} from '@/lib/deck-stream';
import type { DeckPreviewEvent } from '@/lib/generated/model';

const started: DeckPreviewEvent = {
  type: 'deck_preview_started',
  deckId: 'deck-1',
  name: '四半期レビュー',
  totalSlides: 3,
};

function slide(index: number, slug: string): DeckPreviewEvent {
  return {
    type: 'deck_slide_compose_ready',
    deckId: 'deck-1',
    slug,
    index,
    totalSlides: 3,
    composeUrl: `https://example.com/${slug}.json`,
    defsUrl: 'https://example.com/defs.json',
    previewUrl: null,
  };
}

const completed: DeckPreviewEvent = {
  type: 'deck_preview_completed',
  deckId: 'deck-1',
  totalSlides: 3,
};

describe('deckStreamReducer', () => {
  it('starts in idle and is inactive', () => {
    expect(initialDeckStreamState.phase).toBe('idle');
    expect(isStreamingDeckActive(initialDeckStreamState)).toBe(false);
  });

  it('folds a full happy-path stream into a completed deck with ordered slides', () => {
    const state = reduceDeckStream([
      started,
      slide(1, 'cover'),
      slide(2, 'agenda'),
      slide(3, 'summary'),
      completed,
    ]);

    expect(state.phase).toBe('completed');
    expect(state.name).toBe('四半期レビュー');
    expect(state.totalSlides).toBe(3);
    expect(state.defsUrl).toBe('https://example.com/defs.json');
    expect(state.slides.map((s) => s.slug)).toEqual(['cover', 'agenda', 'summary']);
    expect(isStreamingDeckActive(state)).toBe(true);
  });

  it('enters planning on started, generating on first slide', () => {
    const planning = deckStreamReducer(initialDeckStreamState, started);
    expect(planning.phase).toBe('planning');
    expect(planning.slides).toHaveLength(0);

    const generating = deckStreamReducer(planning, slide(1, 'cover'));
    expect(generating.phase).toBe('generating');
    expect(generating.slides).toHaveLength(1);
  });

  it('is immutable — never mutates the input state', () => {
    const next = deckStreamReducer(initialDeckStreamState, started);
    expect(initialDeckStreamState.phase).toBe('idle');
    expect(next).not.toBe(initialDeckStreamState);
  });

  it('de-duplicates a re-sent slide and keeps index order despite arrival order', () => {
    const state = reduceDeckStream([
      started,
      slide(3, 'summary'),
      slide(1, 'cover'),
      slide(1, 'cover'), // duplicate
      slide(2, 'agenda'),
    ]);
    expect(state.slides.map((s) => s.slug)).toEqual(['cover', 'agenda', 'summary']);
    expect(state.slides).toHaveLength(3);
  });

  it('tolerates a missing started event by anchoring on the first slide', () => {
    const state = reduceDeckStream([slide(1, 'cover'), slide(2, 'agenda')]);
    expect(state.deckId).toBe('deck-1');
    expect(state.phase).toBe('generating');
    expect(state.slides).toHaveLength(2);
  });

  it('resets when a new deckId starts in the same thread', () => {
    const first = reduceDeckStream([started, slide(1, 'cover'), completed]);
    const second = deckStreamReducer(first, {
      type: 'deck_preview_started',
      deckId: 'deck-2',
      name: '新しいデッキ',
      totalSlides: 1,
    });
    expect(second.deckId).toBe('deck-2');
    expect(second.slides).toHaveLength(0);
    expect(second.phase).toBe('planning');
  });

  it('ignores compose events bleeding from a different in-progress deck', () => {
    const state = reduceDeckStream([started, slide(1, 'cover')]);
    const bled = deckStreamReducer(state, {
      type: 'deck_slide_compose_ready',
      deckId: 'other-deck',
      slug: 'rogue',
      index: 1,
      composeUrl: 'https://example.com/rogue.json',
      defsUrl: null,
      previewUrl: null,
    });
    expect(bled.slides.map((s) => s.slug)).toEqual(['cover']);
  });

  it('keeps the first non-null defsUrl when a later slide event carries null', () => {
    // `?? ` short-circuits on null (not just undefined), so a deck-wide defs URL
    // seen once is preserved even if a subsequent slide event omits it.
    const withDefs = slide(1, 'cover'); // defsUrl: 'https://example.com/defs.json'
    const noDefs: DeckPreviewEvent = {
      type: 'deck_slide_compose_ready',
      deckId: 'deck-1',
      slug: 'agenda',
      index: 2,
      totalSlides: 3,
      composeUrl: 'https://example.com/agenda.json',
      defsUrl: null,
      previewUrl: null,
    };
    const state = reduceDeckStream([started, withDefs, noDefs]);
    expect(state.defsUrl).toBe('https://example.com/defs.json');
  });

  it('maps dot positions by slide index even when slides arrive out of order', () => {
    // The component looks up slides by index; the reducer must keep them ordered.
    const state = reduceDeckStream([started, slide(3, 'summary'), slide(1, 'cover')]);
    expect(state.slides.map((s) => s.index)).toEqual([1, 3]);
    expect(state.slides.map((s) => s.slug)).toEqual(['cover', 'summary']);
  });

  it('marks failed with a reason but retains already-ready slides', () => {
    const state = reduceDeckStream([
      started,
      slide(1, 'cover'),
      { type: 'deck_preview_failed', deckId: 'deck-1', reason: 'compose failed' },
    ]);
    expect(state.phase).toBe('failed');
    expect(state.failedReason).toBe('compose failed');
    expect(state.slides).toHaveLength(1);
  });

  it('keeps failed terminal even if a late slide arrives afterward', () => {
    const failedFirst = reduceDeckStream([
      started,
      { type: 'deck_preview_failed', deckId: 'deck-1', reason: 'boom' },
      slide(1, 'cover'),
    ]);
    expect(failedFirst.phase).toBe('failed');
    // the late slide is still recorded (degrade, not drop)
    expect(failedFirst.slides).toHaveLength(1);
  });

  it('activates the shell on a phase event before any deck exists (Epic #425)', () => {
    const state = reduceDeckStream([
      { type: 'deck_preview_phase', phase: 'planning' },
      { type: 'deck_preview_phase', phase: 'authoring' },
    ]);
    // The shell becomes active (not idle) and shows the latest generation phase,
    // even though no deck_preview_started/slide has arrived yet.
    expect(state.phase).toBe('planning');
    expect(state.genPhase).toBe('authoring');
    expect(state.deckId).toBeNull();
    expect(state.slides).toHaveLength(0);
    expect(isStreamingDeckActive(state)).toBe(true);
  });

  it('lets a phase event update only the label once the deck is generating', () => {
    const state = reduceDeckStream([
      started,
      slide(1, 'cover'),
      { type: 'deck_preview_phase', phase: 'composing' },
    ]);
    expect(state.phase).toBe('generating');
    expect(state.genPhase).toBe('composing');
    expect(state.slides).toHaveLength(1);
  });
});

describe('mergeSnapshotIntoDeckState (Epic #423)', () => {
  const snapshot = {
    deckId: 'deck-1',
    name: 'スナップショット',
    defsUrl: 'https://cdn/defs.5.json',
    slideOrder: ['slide-1', 'slide-2'],
    slides: [
      {
        slug: 'slide-1',
        index: 1,
        composeUrl: 'https://cdn/s1.5.json',
        previewUrl: null,
      },
      {
        slug: 'slide-2',
        index: 2,
        composeUrl: 'https://cdn/s2.5.json',
        previewUrl: null,
      },
    ],
  };

  it('returns state unchanged when there is no snapshot', () => {
    const state = reduceDeckStream([started]);
    expect(mergeSnapshotIntoDeckState(state, null)).toBe(state);
  });

  it('overlays authoritative slides/defs while keeping the SSE phase label', () => {
    const state = reduceDeckStream([
      started,
      { type: 'deck_preview_phase', phase: 'composing' },
    ]);
    const merged = mergeSnapshotIntoDeckState(state, snapshot);
    expect(merged.slides.map((s) => s.slug)).toEqual(['slide-1', 'slide-2']);
    expect(merged.defsUrl).toBe('https://cdn/defs.5.json');
    expect(merged.genPhase).toBe('composing'); // SSE label preserved
  });

  it('keeps the SSE state when it is ahead of the snapshot (no flicker-back)', () => {
    const state = reduceDeckStream([
      started,
      slide(1, 'a'),
      slide(2, 'b'),
      slide(3, 'c'),
    ]);
    // snapshot only has 2 slides; SSE has 3 → keep SSE.
    expect(mergeSnapshotIntoDeckState(state, snapshot).slides).toHaveLength(3);
  });

  it('ignores a snapshot for a different deck', () => {
    const state = reduceDeckStream([started]);
    const other = { ...snapshot, deckId: 'deck-2' };
    expect(mergeSnapshotIntoDeckState(state, other)).toBe(state);
  });
});
