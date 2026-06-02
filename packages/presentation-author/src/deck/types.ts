/**
 * Deck workspace / Live Preview types.
 *
 * These mirror the SDPM compose/defs contract consumed by the frontend
 * renderer (see SDPM `web-ui/src/components/deck/AnimatedSlidePreview.tsx`
 * `ComposeData` / `DefsData`). Adapted from
 * aws-samples/sample-spec-driven-presentation-maker (MIT-0).
 *
 * Engine-agnostic: produced from a LibreOffice SVG export of any PPTX,
 * including Agentra's PptxGenJS output. Verified against the runtime's
 * LibreOffice 7.4 (bookworm) and host 26.2 in spike #383.
 */

import type { PresentationLanguage } from '../types.js';

/**
 * Schema version for compose/defs JSON payloads AND the deck-result envelope.
 *
 * Intentionally a single constant for the MVP: the compose/defs payloads and
 * the {@link DeckResult} envelope version together. If they ever need to evolve
 * independently, split this into a separate `DECK_RESULT_VERSION`.
 *
 * Note: URL/optional fields below use `string | null` (not `| undefined`) on
 * purpose — these cross the wire as JSON, where `null` is preserved but
 * `undefined` keys are dropped. The SDPM frontend renderer distinguishes
 * "not-yet-generated" (`null`) from present, so the explicit `null` matters.
 */
export const COMPOSE_VERSION = 1 as const;

/** Bounding box of a slide component, in the SVG's user units. */
export interface ComposeBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A single rendered component of a slide (one top-level shape group).
 *
 * `class` is the LibreOffice shape class (e.g. `com.sun.star.drawing.CustomShape`),
 * not a semantic role — see spike #383. `changed` is always `false` in MVP
 * (diff-driven animation is deferred to the local-edit phase).
 */
export interface ComposeComponent {
  class: string;
  bbox: ComposeBBox | null;
  text: string;
  svg: string;
  changed: boolean;
}

/** Per-slide compose payload (defs excluded — shared separately). */
export interface ComposeData {
  version: typeof COMPOSE_VERSION;
  viewBox: string;
  bgFill: string;
  bgSvg: string | null;
  components: ComposeComponent[];
}

/** Deck-wide shared SVG defs (fonts stripped, raster images WebP-encoded). */
export interface DefsData {
  version: typeof COMPOSE_VERSION;
  defs: string;
}

/**
 * Lightweight per-slide manifest persisted in the deck workspace.
 *
 * MVP intentionally does NOT reconstruct a semantic SDPM slide spec from the
 * PptxGenJS output (title/body/figure intent, source mapping, etc. cannot be
 * reliably recovered post-hoc — see design doc §4.1). A full semantic spec is
 * future work behind a generation-time IR.
 */
export interface DeckSlideManifest {
  slug: string;
  /** 1-based content-slide index (LibreOffice slide 0 is structural — spike #383). */
  index: number;
  title: string | null;
  previewKey: string;
  composeKey: string;
}

/** Presigned URLs for spec files (null when absent). */
export interface DeckSpecUrls {
  briefUrl: string | null;
  outlineUrl: string | null;
  artDirectionUrl: string | null;
}

/** Per-slide preview entry returned to the client (presigned URLs). */
export interface DeckSlidePreview {
  slug: string;
  previewUrl: string | null;
  composeUrl: string | null;
}

/**
 * Deck Result attached (additively) to the slide runtime response.
 *
 * Field names mostly align with SDPM `deckService.ts` `DeckDetail` for frontend
 * reuse, with two deliberate differences:
 * - `pptxDownloadUrl` (here) vs SDPM `pptxUrl` — matches Agentra's existing
 *   runtime result field; the ported frontend renames on read.
 * - SDPM's per-slide `updatedAt` is intentionally omitted (YAGNI for the static
 *   preview MVP; slide ordering is conveyed by `slideOrder` / array position).
 *
 * All URL fields are presigned and may be `null` on degrade.
 */
export interface DeckResult {
  deckId: string;
  name: string;
  language: PresentationLanguage;
  slideOrder: string[];
  defsUrl: string | null;
  pptxDownloadUrl: string | null;
  specs: DeckSpecUrls;
  slides: DeckSlidePreview[];
  version: typeof COMPOSE_VERSION;
}
