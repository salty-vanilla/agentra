import { z } from 'zod';
import type { DeckResult } from './artifacts.js';

/**
 * Streaming Deck Preview event contract (Epic #403, Issue #405).
 *
 * These events convey the *progress* of building a deck Live Preview, distinct
 * from the final {@link DeckResult} carried by `artifact_manifest.deck`. They let
 * the frontend reveal slides incrementally instead of waiting for the whole deck.
 *
 * Design constraints (see docs/plans/streaming-deck-preview.md):
 * - The LLM never produces or copies these payloads. They are constructed
 *   deterministically in the runtime / router from trusted pipeline output.
 * - URL fields use `string | null` (not `undefined`): they cross the wire as
 *   JSON, where `null` survives but absent keys are dropped, and the renderer
 *   distinguishes "not-yet-available" (`null`) from present.
 * - Every event is additive and degradable: a `deck_preview_failed` (or a
 *   missing/late event) must never break the existing PPTX result or the final
 *   static {@link DeckResult}.
 */

/** Presigned-URL fields are optional and nullable; see module docs. */
const presignedUrl = z.string().url().nullable();

export const deckPreviewStartedEventSchema = z.object({
  type: z.literal('deck_preview_started'),
  deckId: z.string().min(1),
  name: z.string(),
  /** Known up-front when the deck was generated; absent if not yet determined. */
  totalSlides: z.number().int().min(0).optional(),
});

export type DeckPreviewStartedEvent = z.infer<typeof deckPreviewStartedEventSchema>;

export const deckSlideComposeReadyEventSchema = z.object({
  type: z.literal('deck_slide_compose_ready'),
  deckId: z.string().min(1),
  slug: z.string().min(1),
  /** 1-based content-slide index. */
  index: z.number().int().min(1),
  totalSlides: z.number().int().min(0).optional(),
  composeUrl: presignedUrl,
  /** Deck-wide shared defs, repeated on each slide event so a late join can render. */
  defsUrl: presignedUrl,
  previewUrl: presignedUrl,
});

export type DeckSlideComposeReadyEvent = z.infer<typeof deckSlideComposeReadyEventSchema>;

export const deckPreviewCompletedEventSchema = z.object({
  type: z.literal('deck_preview_completed'),
  deckId: z.string().min(1),
  totalSlides: z.number().int().min(0),
});

export type DeckPreviewCompletedEvent = z.infer<typeof deckPreviewCompletedEventSchema>;

export const deckPreviewFailedEventSchema = z.object({
  type: z.literal('deck_preview_failed'),
  deckId: z.string().min(1),
  /** Human-readable, non-sensitive degrade reason (no secrets / no raw URLs). */
  reason: z.string().min(1),
});

export type DeckPreviewFailedEvent = z.infer<typeof deckPreviewFailedEventSchema>;

/** Coarse generation phases (Epic #425) — surface progress during the long
 * authoring wait, before any slide compose event can exist. Ordered roughly:
 * planning → authoring → rendering → reviewing → composing. */
export const deckPhase = z.enum([
  'planning',
  'authoring',
  'rendering',
  'reviewing',
  'composing',
]);
export type DeckPhase = z.infer<typeof deckPhase>;

export const deckPreviewPhaseEventSchema = z.object({
  type: z.literal('deck_preview_phase'),
  phase: deckPhase,
  /** Optional short human-readable detail (no secrets / no raw URLs). */
  detail: z.string().optional(),
});

export type DeckPreviewPhaseEvent = z.infer<typeof deckPreviewPhaseEventSchema>;

export const deckPreviewEventSchema = z.discriminatedUnion('type', [
  deckPreviewStartedEventSchema,
  deckSlideComposeReadyEventSchema,
  deckPreviewCompletedEventSchema,
  deckPreviewFailedEventSchema,
  deckPreviewPhaseEventSchema,
]);

export type DeckPreviewEvent = z.infer<typeof deckPreviewEventSchema>;

/**
 * Build the deterministic replay sequence for a completed {@link DeckResult}.
 *
 * Used by the router (relays as `deck_progress` SSE events) and available to the
 * runtime for logging. The sequence is: started → one compose_ready per slide
 * (in `slideOrder`) → completed. Slides whose compose URL is missing are still
 * emitted so the frontend can show an ordered placeholder (degrade, not skip).
 *
 * Pure and side-effect free; safe to call with a partially-degraded deck.
 */
export function buildDeckPreviewEvents(deck: DeckResult): DeckPreviewEvent[] {
  const totalSlides = deck.slideOrder.length;
  const bySlug = new Map(deck.slides.map((slide) => [slide.slug, slide]));

  const events: DeckPreviewEvent[] = [
    {
      type: 'deck_preview_started',
      deckId: deck.deckId,
      name: deck.name,
      totalSlides,
    },
  ];

  deck.slideOrder.forEach((slug, position) => {
    const slide = bySlug.get(slug);
    events.push({
      type: 'deck_slide_compose_ready',
      deckId: deck.deckId,
      slug,
      index: position + 1,
      totalSlides,
      composeUrl: slide?.composeUrl ?? null,
      defsUrl: deck.defsUrl,
      previewUrl: slide?.previewUrl ?? null,
    });
  });

  events.push({
    type: 'deck_preview_completed',
    deckId: deck.deckId,
    totalSlides,
  });

  return events;
}
