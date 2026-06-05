import type { DeckPreviewEvent } from '@/lib/generated/model';

/**
 * Streaming Deck Preview client state (Epic #403, Issues #409/#410).
 *
 * A pure reducer folds the ordered `deck_progress` events into a renderable
 * view so the UI can reveal slides incrementally before the final static
 * `DeckResult` arrives. Designed to survive a hostile stream: duplicate, late,
 * reordered, or partial events must never throw or corrupt the view.
 */

export type StreamingDeckPhase =
  | 'idle'
  | 'planning'
  | 'generating'
  | 'completed'
  | 'failed';

export interface StreamingDeckSlide {
  slug: string;
  /** 1-based content-slide index (used for ordering and labels). */
  index: number;
  composeUrl: string | null;
  previewUrl: string | null;
}

/** Coarse generation phase label (Epic #425) shown during the authoring wait. */
export type DeckGenPhase =
  | 'planning'
  | 'authoring'
  | 'rendering'
  | 'reviewing'
  | 'composing';

export interface StreamingDeckState {
  deckId: string | null;
  name: string | null;
  phase: StreamingDeckPhase;
  /** Latest coarse generation phase (Epic #425), for a progress label. */
  genPhase: DeckGenPhase | null;
  totalSlides: number | null;
  /** Deck-wide shared defs, carried on each slide event (last non-null wins). */
  defsUrl: string | null;
  /** Ready slides, de-duplicated by slug and sorted by index. */
  slides: StreamingDeckSlide[];
  failedReason: string | null;
}

export const initialDeckStreamState: StreamingDeckState = {
  deckId: null,
  name: null,
  phase: 'idle',
  genPhase: null,
  totalSlides: null,
  defsUrl: null,
  slides: [],
  failedReason: null,
};

/** A fresh state for a newly announced deck (immutable — never mutate args). */
function startedState(
  deckId: string,
  name: string,
  totalSlides: number | null,
): StreamingDeckState {
  return {
    deckId,
    name,
    phase: 'planning',
    // A deck that has started is in (or past) the composing phase.
    genPhase: 'composing',
    totalSlides,
    defsUrl: null,
    slides: [],
    failedReason: null,
  };
}

/** Insert or replace a slide by slug, keeping the list ordered by index. */
function upsertSlide(
  slides: readonly StreamingDeckSlide[],
  next: StreamingDeckSlide,
): StreamingDeckSlide[] {
  const without = slides.filter((slide) => slide.slug !== next.slug);
  return [...without, next].sort((a, b) => a.index - b.index);
}

/**
 * Fold one deck preview event into the streaming state (pure / immutable).
 *
 * A `started` event for a *new* deckId resets the view, so a second deck in the
 * same thread doesn't inherit the previous deck's slides. Events whose deckId
 * disagrees with an in-progress deck are ignored (cross-deck bleed guard),
 * except a `started` which always (re)anchors the deck.
 */
export function deckStreamReducer(
  state: StreamingDeckState,
  event: DeckPreviewEvent,
): StreamingDeckState {
  switch (event.type) {
    case 'deck_preview_phase':
      // Coarse phase (Epic #425) — fires during the authoring wait, before any
      // deck exists. Activate the shell so the user sees movement, and record
      // the label. Doesn't touch deckId/slides.
      return {
        ...state,
        genPhase: event.phase,
        phase: state.phase === 'idle' ? 'planning' : state.phase,
      };

    case 'deck_preview_started':
      return startedState(event.deckId, event.name, event.totalSlides ?? null);

    case 'deck_slide_compose_ready': {
      // Tolerate a missing `started` (e.g. dropped first event): anchor here.
      const base =
        state.deckId === event.deckId
          ? state
          : state.deckId === null
            ? {
                ...startedState(
                  event.deckId,
                  state.name ?? '',
                  event.totalSlides ?? null,
                ),
              }
            : null;
      if (!base) return state; // event for a different deck — ignore

      return {
        ...base,
        phase: base.phase === 'failed' ? 'failed' : 'generating',
        totalSlides: event.totalSlides ?? base.totalSlides,
        defsUrl: event.defsUrl ?? base.defsUrl,
        slides: upsertSlide(base.slides, {
          slug: event.slug,
          index: event.index,
          composeUrl: event.composeUrl,
          previewUrl: event.previewUrl,
        }),
      };
    }

    case 'deck_preview_completed':
      if (state.deckId !== event.deckId) return state;
      return {
        ...state,
        phase: 'completed',
        totalSlides: event.totalSlides ?? state.totalSlides,
      };

    case 'deck_preview_failed':
      if (state.deckId !== null && state.deckId !== event.deckId) return state;
      return {
        ...state,
        deckId: state.deckId ?? event.deckId,
        phase: 'failed',
        failedReason: event.reason,
      };

    default:
      return state;
  }
}

/** Fold a sequence of events from the initial state (convenience for tests/replay). */
export function reduceDeckStream(
  events: readonly DeckPreviewEvent[],
  from: StreamingDeckState = initialDeckStreamState,
): StreamingDeckState {
  return events.reduce(deckStreamReducer, from);
}

/** True when the shell should render (a deck has been announced and isn't done-static yet). */
export function isStreamingDeckActive(state: StreamingDeckState): boolean {
  return state.phase !== 'idle';
}
