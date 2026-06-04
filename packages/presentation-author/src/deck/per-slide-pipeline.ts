import { join } from 'node:path';
import type { ComposeSvgInput, ComposeSvgResult } from './compose.js';
import type { ExportSvgInput, ExportSvgResult } from './export-svg.js';
import type { SplitPptxInput, SplitPptxResult } from './split-pptx.js';

export interface PerSlideDeckInput {
  /** Fully authored multi-slide PPTX. */
  pptxPath: string;
  /** Work directory; per-slide artifacts go under `<outputDir>/slide-<n>/`. */
  outputDir: string;
  deckId: string;
  name: string;
  language: 'ja' | 'en';
}

/** What the orchestrator hands to {@link PerSlideDeckDeps.persistSlide}. */
export interface PerSlidePersistInput {
  deckId: string;
  slug: string;
  index: number;
  /** Local path to the slide's `<slug>.compose.json`. */
  composePath: string;
  /** Local path to the slide's `defs.json` (shared; upload once). */
  defsPath: string;
  /** True for the first successfully composed slide — the defs carrier. */
  isFirst: boolean;
}

/** A persisted slide with presigned URLs, ready to reveal in the client. */
export interface PerSlidePersistedSlide {
  slug: string;
  index: number;
  composeUrl: string | null;
  previewUrl: string | null;
  /** Non-null only on the first slide (shared deck defs). */
  defsUrl: string | null;
}

export interface PerSlideDeckDeps {
  splitPptx: (input: SplitPptxInput) => Promise<SplitPptxResult>;
  exportSvg: (input: ExportSvgInput) => Promise<ExportSvgResult>;
  composeSvg: (input: ComposeSvgInput) => Promise<ComposeSvgResult>;
  /** Upload one slide (and defs on the first) and return its presigned URLs. */
  persistSlide: (input: PerSlidePersistInput) => Promise<PerSlidePersistedSlide | null>;
  /** Called once with the slide count after a successful split. Must not throw. */
  onStart?: (totalSlides: number) => void;
  /** Called as each slide becomes ready, in source order. Must not throw. */
  onSlideReady?: (slide: PerSlidePersistedSlide) => void;
}

export interface PerSlideDeckResult {
  /** False → the caller should fall back to the batch deck-preview pipeline. */
  ok: boolean;
  slides: PerSlidePersistedSlide[];
  warnings: string[];
}

/**
 * Render a fully authored PPTX into the deck Live Preview **one slide at a
 * time** (Epic #417 R4): split → per-slide export → compose → persist → emit,
 * in source order, so slide 1 reaches the client before slide N has rendered.
 *
 * Never throws and always degrades:
 * - a failed split returns `ok: false` (caller falls back to the batch pipeline);
 * - a single slide that fails to export/compose/persist is skipped with a
 *   warning, keeping the slides that did succeed;
 * - `ok` is true as long as at least one slide was persisted.
 */
export async function generatePerSlideDeck(
  input: PerSlideDeckInput,
  deps: PerSlideDeckDeps,
): Promise<PerSlideDeckResult> {
  const warnings: string[] = [];

  const split = await deps.splitPptx({
    pptxPath: input.pptxPath,
    outputDir: input.outputDir,
  });
  warnings.push(...split.warnings);
  if (!split.success || split.slides.length === 0) {
    return { ok: false, slides: [], warnings };
  }

  try {
    deps.onStart?.(split.slides.length);
  } catch {
    // A throwing listener is the listener's bug — never break the pipeline.
  }

  const persisted: PerSlidePersistedSlide[] = [];
  let isFirst = true;

  // Sequential by design: each slide is exported→composed→persisted→emitted
  // before the next, so the client receives them incrementally and in order.
  for (const slide of split.slides) {
    try {
      const slideDir = join(input.outputDir, `slide-${slide.index}`);
      const slug = `slide-${slide.index}`;

      const svg = await deps.exportSvg({
        pptxPath: slide.pptxPath,
        outputDir: slideDir,
      });
      warnings.push(...svg.warnings);
      if (!svg.success || !svg.svgPath) {
        warnings.push(`slide ${slide.index} skipped: SVG export failed`);
        continue;
      }

      const compose = await deps.composeSvg({
        svgPath: svg.svgPath,
        outputDir: slideDir,
        slugs: [slug],
      });
      warnings.push(...compose.warnings);
      const entry = compose.slides[0];
      if (!compose.success || !compose.defsPath || !entry) {
        warnings.push(`slide ${slide.index} skipped: compose produced no slide`);
        continue;
      }

      const result = await deps.persistSlide({
        deckId: input.deckId,
        slug,
        index: slide.index,
        composePath: entry.composePath,
        defsPath: compose.defsPath,
        isFirst,
      });
      if (!result) {
        warnings.push(`slide ${slide.index} skipped: persist produced no result`);
        continue;
      }

      persisted.push(result);
      isFirst = false;
      try {
        deps.onSlideReady?.(result);
      } catch {
        // A throwing listener is the listener's bug — never break the pipeline.
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`slide ${slide.index} failed: ${msg}`);
    }
  }

  return { ok: persisted.length > 0, slides: persisted, warnings };
}
