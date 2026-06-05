import type { ComposeData } from '@/lib/deck-preview';

/**
 * Animation geometry for the AnimatedSlidePreview overlay (Epic #417/#424).
 *
 * The static slide SVG is built + DOMPurify-sanitized as before; animation is a
 * separate React overlay on top (so it survives sanitization). This pure helper
 * computes which components animate and where, as percentages of the viewBox so
 * the overlay scales with the slide.
 */

export interface AnimBox {
  /** Component index in compose.components. */
  index: number;
  /** Position/size as percentages of the slide (0–100). */
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  /** Center, for moving the agent cursor. */
  cxPct: number;
  cyPct: number;
}

function viewBoxDims(viewBox: string): { w: number; h: number } {
  const parts = viewBox.split(/\s+/).map(Number);
  const w = parts[2] ?? 0;
  const h = parts[3] ?? 0;
  return {
    w: Number.isFinite(w) && w > 0 ? w : 0,
    h: Number.isFinite(h) && h > 0 ? h : 0,
  };
}

/**
 * The boxes to animate: on first appearance every component with a bbox draws
 * on; on a later update only the components the backend marked `changed`. Empty
 * when the viewBox is degenerate or nothing changed.
 */
export function changedAnimBoxes(
  compose: ComposeData,
  isFirstAppearance: boolean,
): AnimBox[] {
  const { w, h } = viewBoxDims(compose.viewBox);
  if (w === 0 || h === 0) return [];

  return compose.components.flatMap((component, index) => {
    if (!component.bbox) return [];
    if (!isFirstAppearance && !component.changed) return [];
    const { x, y, w: bw, h: bh } = component.bbox;
    return [
      {
        index,
        leftPct: (x / w) * 100,
        topPct: (y / h) * 100,
        widthPct: (bw / w) * 100,
        heightPct: (bh / h) * 100,
        cxPct: ((x + bw / 2) / w) * 100,
        cyPct: ((y + bh / 2) / h) * 100,
      },
    ];
  });
}

/** Per-box stagger (ms) so changed components reveal in sequence. */
export const ANIM_STAGGER_MS = 220;
/** Draw-on duration (ms) of a single component's wireframe → reveal. */
export const ANIM_DRAW_MS = 480;

/** Total animation time for a set of boxes (for the auto-hide timer). */
export function animTotalMs(boxCount: number): number {
  if (boxCount <= 0) return 0;
  return (boxCount - 1) * ANIM_STAGGER_MS + ANIM_DRAW_MS;
}
