import type { PerSlidePersistedSlide } from './per-slide-pipeline.js';

/**
 * Per-slide revision (Epic #417/#426).
 *
 * "Fix slide N like this" re-authors only the target slide, marks its compose
 * components `changed`, and re-uploads it under a fresh epoch — leaving every
 * other slide (and the existing PPTX) untouched. The authoritative snapshot
 * (#422) then surfaces the new epoch, the client poll (#423) detects it, and
 * AnimatedSlidePreview (#424) animates exactly the changed components.
 */

interface ComposeComponentLike {
  changed: boolean;
  [key: string]: unknown;
}

interface ComposeLike {
  components?: ComposeComponentLike[];
  [key: string]: unknown;
}

/**
 * Mark every component of a compose payload as `changed` (immutable). This is
 * what makes a revised slide animate its diff on the client; a freshly composed
 * slide has `changed: false` everywhere, so a revision flips them on.
 */
export function markComposeChanged<T extends ComposeLike>(compose: T): T {
  if (!Array.isArray(compose.components)) return compose;
  return {
    ...compose,
    components: compose.components.map((component) => ({
      ...component,
      changed: true,
    })),
  };
}

export interface ReviseSlideInput {
  deckId: string;
  /** Target slide slug (e.g. `slide-2`); only this slide is touched. */
  slug: string;
  index: number;
  /** Local path to the re-authored slide's compose JSON. */
  composePath: string;
}

export interface ReviseSlidePersistInput {
  deckId: string;
  slug: string;
  index: number;
  /** Epoch for the new compose key — strictly greater than the prior upload. */
  epoch: number;
  /** The compose payload with `changed` components, ready to upload. */
  compose: ComposeLike;
}

export interface ReviseSlideDeps {
  readCompose: (composePath: string) => Promise<ComposeLike>;
  /** Upload one revised slide under an epoch key and return its presigned URLs. */
  persistRevised: (
    input: ReviseSlidePersistInput,
  ) => Promise<PerSlidePersistedSlide | null>;
  /** Called when the revised slide is ready (drives the live reveal). */
  onSlideReady?: (slide: PerSlidePersistedSlide) => void;
}

/**
 * Revise a single slide: read its re-authored compose, mark it changed, persist
 * it under a fresh epoch, and emit it. Never throws — a read/persist failure
 * degrades to `null` so a revision can never corrupt the rest of the deck.
 */
export async function reviseSlide(
  input: ReviseSlideInput,
  deps: ReviseSlideDeps,
): Promise<PerSlidePersistedSlide | null> {
  let compose: ComposeLike;
  try {
    compose = await deps.readCompose(input.composePath);
  } catch {
    return null;
  }

  const changed = markComposeChanged(compose);
  const result = await deps.persistRevised({
    deckId: input.deckId,
    slug: input.slug,
    index: input.index,
    epoch: Date.now(),
    compose: changed,
  });
  if (!result) return null;

  try {
    deps.onSlideReady?.(result);
  } catch {
    // a throwing listener must never break the revision
  }
  return result;
}
