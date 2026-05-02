import type { LayoutSpec, ResolvedFrame } from "#src/index.js";

/**
 * Returns the inter-block gap (in slide units) appropriate for the layout
 * density.  A higher density packs blocks closer together so more fits on a
 * single slide; a low density gives the slide more breathing room.
 */
export function gapForDensity(density: LayoutSpec["density"] | undefined, base = 18): number {
  if (density === "high") return Math.max(8, base - 6);
  if (density === "low") return base + 10;
  return base;
}

/**
 * Minimum readable height for a sub-frame.  Validation emits a warning when
 * an element falls below this height.
 */
export const MIN_SUBFRAME_HEIGHT = 60;

// ── Standard component sizes ──────────────────────────────────────────
// Preferred heights for common slide components. Layout strategies should
// use these as targets and clamp to available space when the region is
// smaller than the standard size.
export const STANDARD_KPI_CARD_HEIGHT = 200;
export const STANDARD_CHART_HEIGHT = 280;
export const STANDARD_CALLOUT_HEIGHT = 80;

/**
 * Splits `frame` vertically into `count` slots with adaptive gap and a
 * minimum slot height.  When the frame cannot fit `count` slots at the
 * minimum height, the count is clamped and the overflow blocks reuse the
 * last slot (validation surfaces the resulting overlap as a warning).
 *
 * Mirrors the original `splitVertical` in `build-presentation-ir.ts` but
 * lives here so layout strategies can call it without circular imports.
 */
export function splitVertical(
  frame: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  if (count <= 1) {
    return [frame];
  }

  const gap = gapForDensity(density, count >= 3 ? 18 : 12);
  const maxByMinHeight = Math.max(
    1,
    Math.floor((frame.height + gap) / (MIN_SUBFRAME_HEIGHT + gap)),
  );
  const effectiveCount = Math.min(count, maxByMinHeight);
  const totalGap = gap * (effectiveCount - 1);
  const slotHeight = Math.max(
    MIN_SUBFRAME_HEIGHT,
    Math.floor((frame.height - totalGap) / effectiveCount),
  );

  const frames: ResolvedFrame[] = [];
  for (let index = 0; index < effectiveCount; index += 1) {
    frames.push({
      x: frame.x,
      y: frame.y + index * (slotHeight + gap),
      width: frame.width,
      height: slotHeight,
    });
  }

  if (effectiveCount < count) {
    const lastFrame = frames[frames.length - 1];
    if (lastFrame) {
      for (let index = effectiveCount; index < count; index += 1) {
        frames.push({ ...lastFrame });
      }
    }
  }

  return frames;
}

/**
 * Splits `frame` horizontally into `count` slots with an adaptive gap.
 */
export function splitHorizontal(
  frame: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  if (count <= 1) {
    return [frame];
  }

  const gap = gapForDensity(density, 16);
  const totalGap = gap * (count - 1);
  const slotWidth = Math.max(80, Math.floor((frame.width - totalGap) / count));

  const frames: ResolvedFrame[] = [];
  for (let index = 0; index < count; index += 1) {
    frames.push({
      x: frame.x + index * (slotWidth + gap),
      y: frame.y,
      width: slotWidth,
      height: frame.height,
    });
  }
  return frames;
}

/**
 * Splits `frame` into a regular grid of `cols` x `rows` slots.
 */
export function splitGrid(
  frame: ResolvedFrame,
  cols: number,
  rows: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  const gapX = gapForDensity(density, 16);
  const gapY = gapForDensity(density, 16);
  const slotWidth = Math.max(80, Math.floor((frame.width - gapX * (cols - 1)) / cols));
  const slotHeight = Math.max(
    MIN_SUBFRAME_HEIGHT,
    Math.floor((frame.height - gapY * (rows - 1)) / rows),
  );

  const frames: ResolvedFrame[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      frames.push({
        x: frame.x + col * (slotWidth + gapX),
        y: frame.y + row * (slotHeight + gapY),
        width: slotWidth,
        height: slotHeight,
      });
    }
  }
  return frames;
}

/**
 * Picks grid dimensions for `count` items with a slight preference for wider
 * grids (PowerPoint slides are 16:9).
 */
export function pickGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
}

// ── Deterministic placement helpers ───────────────────────────────────
// These helpers produce frames for specific placement patterns that
// reviewers were repeatedly correcting via frame operations.

/**
 * Creates a horizontal KPI rail — one row of equal-width metric cards.
 * For 5+ items, falls back to a 2-row grid.
 *
 * Designed for executive-summary-kpi and dashboard strategies where
 * KPI cards should always be side-by-side.
 */
export function createMetricRail(
  region: ResolvedFrame,
  count: number,
  options?: {
    minCardHeight?: number;
    maxCardHeight?: number;
    gap?: number;
  },
): ResolvedFrame[] {
  if (count <= 0) return [];
  const gap = options?.gap ?? 20;
  const minH = options?.minCardHeight ?? 120;
  const maxH = options?.maxCardHeight ?? 160;
  const cardHeight = Math.max(minH, Math.min(maxH, region.height));

  if (count <= 4) {
    // Single row — always horizontal
    const totalGap = gap * (count - 1);
    const cardWidth = Math.max(80, Math.floor((region.width - totalGap) / count));
    return Array.from({ length: count }, (_, i) => ({
      x: region.x + i * (cardWidth + gap),
      y: region.y,
      width: cardWidth,
      height: cardHeight,
    }));
  }

  // 5+ items: 2-row grid
  const cols = Math.ceil(count / 2);
  const rows = 2;
  const gapX = gap;
  const gapY = gap;
  const cardWidth = Math.max(80, Math.floor((region.width - gapX * (cols - 1)) / cols));
  const rowHeight = Math.max(
    minH,
    Math.min(maxH, Math.floor((region.height - gapY) / rows)),
  );
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: region.x + col * (cardWidth + gapX),
      y: region.y + row * (rowHeight + gapY),
      width: cardWidth,
      height: rowHeight,
    };
  });
}

/**
 * Creates a small-multiples grid optimised for 2–4 chart panels.
 *
 * - 2 items: 2 columns
 * - 3 items: 3 columns
 * - 4 items: 2×2 grid
 * - 5+: falls back to `splitGrid`
 *
 * Ensures each chart is at least 280 px wide.
 */
export function createSmallMultiplesGrid(
  region: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  if (count <= 1) return [region];
  const gap = gapForDensity(density, 22);

  if (count <= 3) {
    // Single row of N columns
    const totalGap = gap * (count - 1);
    const cardWidth = Math.max(280, Math.floor((region.width - totalGap) / count));
    return Array.from({ length: count }, (_, i) => ({
      x: region.x + i * (cardWidth + gap),
      y: region.y,
      width: cardWidth,
      height: region.height,
    }));
  }

  if (count === 4) {
    return splitGrid(region, 2, 2, density);
  }

  // 5+ — generic grid
  const { cols, rows } = pickGridDimensions(count);
  return splitGrid(region, cols, rows, density);
}

/**
 * Creates a 2×2 card grid for 3–4 initiative/proposal blocks.
 *
 * - 1–2: horizontal row
 * - 3–4: 2×2 grid
 * - 5+: 2 columns × N rows
 */
export function createTwoByTwoCards(
  region: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  if (count <= 0) return [];
  const gap = gapForDensity(density, 16);

  if (count <= 2) {
    return splitHorizontal(region, count, density);
  }

  if (count <= 4) {
    return splitGrid(region, 2, 2, density);
  }

  // 5+ items: 2 columns, N rows
  const rows = Math.ceil(count / 2);
  return splitGrid(region, 2, rows, density);
}

// ---------------------------------------------------------------------------
// Approval Item Frames  (Phase 7.7-fix2)
// ---------------------------------------------------------------------------

/**
 * Create non-overlapping frames for approval items.
 *
 * - 1 item  → full card
 * - 2 items → vertical stack (or horizontal if region is very wide)
 * - 3–4     → 2×2 grid if width ≥ 400, otherwise vertical stack
 * - 5+      → vertical stack with min height 50
 */
export function createApprovalItemFrames(
  region: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  if (count <= 0) return [];
  if (count === 1) return [region];

  const gap = gapForDensity(density, 12);

  if (count === 2) {
    // Prefer vertical stack in typical approval slot (tall & narrow-ish)
    if (region.width >= region.height * 2.5) {
      return splitHorizontal(region, 2, density);
    }
    return splitVertical(region, 2, density);
  }

  // 3–4 items: 2×2 grid if the region is wide enough
  if (count <= 4 && region.width >= 400) {
    return splitGrid(region, 2, 2, density);
  }

  // Vertical stack for narrow regions or 5+ items
  const rowHeight = Math.max(50, Math.floor((region.height - gap * (count - 1)) / count));
  return Array.from({ length: count }, (_, i) => ({
    x: region.x,
    y: region.y + i * (rowHeight + gap),
    width: region.width,
    height: rowHeight,
  }));
}
