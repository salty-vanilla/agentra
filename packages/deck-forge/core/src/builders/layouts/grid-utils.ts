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
