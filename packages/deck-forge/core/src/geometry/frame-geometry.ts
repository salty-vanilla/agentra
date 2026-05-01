import type { ResolvedFrame, SlideSize } from "#src/index.js";

/**
 * Pure geometry helpers for working with element/region frames.
 *
 * All helpers are coordinate-system agnostic but assume the same units as
 * `ResolvedFrame` (typically pixels at the slide's `slideSize.unit`).
 */

export type FrameLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Ratio of overlap area between two frames, normalized by the smaller frame's
 * area. Returns 0 when the frames don't intersect or either has zero area.
 *
 * The semantics match the previous implementation in
 * `validation/rules/layout.ts` so the auto-fix loop continues to behave
 * identically.
 */
export function frameOverlapRatio(left: FrameLike, right: FrameLike): number {
  const overlapWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  const overlapArea = overlapWidth * overlapHeight;
  if (overlapArea === 0) {
    return 0;
  }

  const smallerArea = Math.min(left.width * left.height, right.width * right.height);
  return smallerArea > 0 ? overlapArea / smallerArea : 0;
}

export function framesEqual(left: FrameLike, right: FrameLike, epsilon = 0.5): boolean {
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon &&
    Math.abs(left.width - right.width) <= epsilon &&
    Math.abs(left.height - right.height) <= epsilon
  );
}

export function isFrameOutOfBounds(
  frame: FrameLike,
  slideSize: SlideSize,
  padding = 0,
): boolean {
  return (
    frame.x < padding ||
    frame.y < padding ||
    frame.x + frame.width > slideSize.width - padding ||
    frame.y + frame.height > slideSize.height - padding
  );
}

/**
 * Returns a new frame clamped to the slide's drawable area.
 *
 * The frame is first shrunk to fit (if it exceeds the bounds) then nudged so
 * the top-left corner sits within the padded region. Width/height never go
 * below 1 to avoid producing degenerate frames.
 */
export function clampFrameToSlide(
  frame: FrameLike,
  slideSize: SlideSize,
  padding = 0,
): ResolvedFrame {
  const maxWidth = Math.max(1, slideSize.width - padding * 2);
  const maxHeight = Math.max(1, slideSize.height - padding * 2);
  const width = Math.max(1, Math.min(frame.width, maxWidth));
  const height = Math.max(1, Math.min(frame.height, maxHeight));
  const minX = padding;
  const minY = padding;
  const maxX = slideSize.width - padding - width;
  const maxY = slideSize.height - padding - height;
  const x = Math.max(minX, Math.min(frame.x, maxX));
  const y = Math.max(minY, Math.min(frame.y, maxY));
  return { x, y, width, height };
}

/**
 * Distribute `count` frames vertically inside the given region frame, with an
 * optional inner gap between rows. Each resulting frame uses the full region
 * width and an equal share of the available height.
 */
export function stackFramesVertically(
  regionFrame: FrameLike,
  count: number,
  gap = 12,
): ResolvedFrame[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [
      {
        x: regionFrame.x,
        y: regionFrame.y,
        width: regionFrame.width,
        height: regionFrame.height,
      },
    ];
  }

  const totalGap = gap * (count - 1);
  const usableHeight = Math.max(1, regionFrame.height - totalGap);
  const itemHeight = Math.max(1, Math.floor(usableHeight / count));
  const frames: ResolvedFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    frames.push({
      x: regionFrame.x,
      y: regionFrame.y + i * (itemHeight + gap),
      width: regionFrame.width,
      height: itemHeight,
    });
  }
  return frames;
}

/**
 * Group indices of frames that share an identical (within `epsilon`) frame.
 * Only groups of size >= 2 are returned.
 */
export function findDuplicateFrameGroups(
  frames: FrameLike[],
  epsilon = 0.5,
): number[][] {
  const groups: number[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < frames.length; i += 1) {
    if (assigned.has(i)) continue;
    const a = frames[i];
    if (!a) continue;
    const group: number[] = [i];
    for (let j = i + 1; j < frames.length; j += 1) {
      if (assigned.has(j)) continue;
      const b = frames[j];
      if (!b) continue;
      if (framesEqual(a, b, epsilon)) {
        group.push(j);
        assigned.add(j);
      }
    }
    if (group.length >= 2) {
      assigned.add(i);
      groups.push(group);
    }
  }

  return groups;
}
