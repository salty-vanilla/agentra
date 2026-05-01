/**
 * Deterministic per-slide metric scoring functions.
 *
 * Each function takes a SlideIR and returns a score in [0, 1] where 1 is
 * ideal. They use only geometric / structural signals — no LLM or vision.
 */

import type { SlideIR, TextElementIR, ResolvedFrame } from "#src/index.js";
import {
  QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT,
  QUALITY_MAX_COMFORTABLE_TABLE_CELLS,
  QUALITY_MAX_COMFORTABLE_TABLE_ROWS,
  QUALITY_MAX_COMFORTABLE_TABLE_COLUMNS,
  QUALITY_MIN_UTILIZATION_RATIO,
  QUALITY_MAX_UTILIZATION_RATIO,
  QUALITY_ALIGNMENT_TOLERANCE_PX,
} from "./quality-thresholds.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slideArea(slide: SlideIR): number {
  return slide.layout.slideSize.width * slide.layout.slideSize.height;
}

function frameArea(f: ResolvedFrame): number {
  return f.width * f.height;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function textElements(slide: SlideIR): TextElementIR[] {
  return slide.elements.filter((el): el is TextElementIR => el.type === "text");
}

// ---------------------------------------------------------------------------
// 1. Whitespace balance
// ---------------------------------------------------------------------------

/**
 * Scores how well the slide balances content and whitespace.
 *
 * Occupied-area ratios between ~25 % and ~75 % receive the best score.
 * Scores taper toward 0 for very sparse (<10 %) or very crowded (>90 %)
 * slides.
 */
export function scoreWhitespaceBalance(slide: SlideIR): number {
  const total = slideArea(slide);
  if (total === 0) return 0;

  const occupied = slide.elements.reduce((sum, el) => sum + frameArea(el.frame), 0);
  const ratio = occupied / total;

  // Ideal range: [0.20, 0.75].  Full score between QUALITY_MIN and QUALITY_MAX,
  // tapering linearly outside.
  const lo = QUALITY_MIN_UTILIZATION_RATIO; // 0.15
  const hi = QUALITY_MAX_UTILIZATION_RATIO; // 0.85
  const sweetLo = 0.2;
  const sweetHi = 0.75;

  if (ratio >= sweetLo && ratio <= sweetHi) return 1;
  if (ratio < lo) return clamp01(ratio / lo);
  if (ratio > hi) return clamp01((1 - ratio) / (1 - hi));
  if (ratio < sweetLo) return clamp01(0.8 + 0.2 * ((ratio - lo) / (sweetLo - lo)));
  // ratio > sweetHi && ratio <= hi
  return clamp01(0.8 + 0.2 * ((hi - ratio) / (hi - sweetHi)));
}

// ---------------------------------------------------------------------------
// 2. Visual hierarchy
// ---------------------------------------------------------------------------

/**
 * Measures differentiation of text roles by font-size.
 *
 * A slide with well-separated title / body / caption sizes scores 1.
 * A slide where all text shares the same size scores low.
 * Slides with ≤1 text element automatically score 1 (no hierarchy needed).
 */
export function scoreVisualHierarchy(slide: SlideIR): number {
  const texts = textElements(slide);
  if (texts.length <= 1) return 1;

  const fontSizes = texts.map((t) => t.style.fontSize ?? 18);
  const uniqueSizes = new Set(fontSizes);
  if (uniqueSizes.size === 1) return 0.2; // completely flat

  const max = Math.max(...fontSizes);
  const min = Math.min(...fontSizes);
  const spread = max - min;

  // A spread ≥ 12 px is ideal.  Below that, taper.
  const idealSpread = 12;
  const spreadScore = clamp01(spread / idealSpread);

  // Bonus for having distinct role-based sizes (title > body > caption).
  const titleSize = texts.find((t) => t.role === "title")?.style.fontSize;
  const bodySize = texts.find((t) => t.role === "body")?.style.fontSize;
  const captionSize = texts.find(
    (t) => t.role === "caption" || t.role === "callout" || t.role === "footer",
  )?.style.fontSize;

  let roleBonus = 0;
  if (titleSize && bodySize && titleSize > bodySize) roleBonus += 0.15;
  if (bodySize && captionSize && bodySize > captionSize) roleBonus += 0.1;
  if (titleSize && captionSize && titleSize > captionSize) roleBonus += 0.05;

  return clamp01(spreadScore * 0.7 + 0.3 + roleBonus);
}

// ---------------------------------------------------------------------------
// 3. Region utilization
// ---------------------------------------------------------------------------

/**
 * Fraction of defined layout regions that contain at least one element
 * whose frame overlaps the region by ≥ 30 %.
 *
 * NOTE: This metric is intentionally low-weight in the summary score.
 * Many good slides leave some regions intentionally unused.
 */
export function scoreRegionUtilization(slide: SlideIR): number {
  const regions = slide.layout.regions;
  if (regions.length === 0) return 1; // no regions defined — nothing to penalise

  let usedCount = 0;
  for (const region of regions) {
    const used = slide.elements.some((el) => {
      return overlapFraction(el.frame, region.frame) >= 0.3;
    });
    if (used) usedCount++;
  }

  return usedCount / regions.length;
}

/** Simple overlap fraction (intersection / smaller area). */
function overlapFraction(a: ResolvedFrame, b: ResolvedFrame): number {
  const ox = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const oa = ox * oy;
  if (oa === 0) return 0;
  const smaller = Math.min(frameArea(a), frameArea(b));
  return smaller > 0 ? oa / smaller : 0;
}

// ---------------------------------------------------------------------------
// 4. Alignment consistency
// ---------------------------------------------------------------------------

/**
 * Scores how well element edges align to a small set of shared axes.
 *
 * If every element's left-edge or top-edge aligns with at least one other
 * element (within tolerance), the score is 1.
 */
export function scoreAlignmentConsistency(slide: SlideIR): number {
  const els = slide.elements;
  if (els.length <= 1) return 1;

  const tolerance = QUALITY_ALIGNMENT_TOLERANCE_PX;

  // Collect left-x and top-y edges
  const leftEdges = els.map((el) => el.frame.x);
  const topEdges = els.map((el) => el.frame.y);

  let alignedCount = 0;
  for (let i = 0; i < els.length; i++) {
    const hasXPeer = leftEdges.some(
      (x, j) => j !== i && Math.abs(x - leftEdges[i]!) <= tolerance,
    );
    const hasYPeer = topEdges.some(
      (y, j) => j !== i && Math.abs(y - topEdges[i]!) <= tolerance,
    );
    if (hasXPeer || hasYPeer) alignedCount++;
  }

  return alignedCount / els.length;
}

// ---------------------------------------------------------------------------
// 5. Density comfort
// ---------------------------------------------------------------------------

/**
 * Penalises slides that pack too many elements, large tables, or excessive
 * text volume into one slide.
 */
export function scoreDensityComfort(slide: SlideIR): number {
  const els = slide.elements;

  // Element count penalty
  const countPenalty = clamp01(els.length / QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT);

  // Table penalty — most aggressive single signal
  let tablePenalty = 0;
  for (const el of els) {
    if (el.type === "table") {
      const cols = el.headers.length;
      const rows = el.rows.length;
      const cells = cols * rows;
      const colPenalty = clamp01(cols / QUALITY_MAX_COMFORTABLE_TABLE_COLUMNS);
      const rowPenalty = clamp01(rows / QUALITY_MAX_COMFORTABLE_TABLE_ROWS);
      const cellPenalty = clamp01(cells / QUALITY_MAX_COMFORTABLE_TABLE_CELLS);
      tablePenalty = Math.max(tablePenalty, colPenalty, rowPenalty, cellPenalty);
    }
  }

  // Combined: highest penalty dominates.  Invert to make it a score.
  const penalty = Math.max(countPenalty, tablePenalty);
  return clamp01(1 - penalty * 0.8); // leave 0.2 floor so single-table slides don't bottom-out
}

// ---------------------------------------------------------------------------
// 6. Emphasis clarity
// ---------------------------------------------------------------------------

/**
 * Checks that one element is a clear focal point (largest frame or title).
 * Slides with no obvious emphasis score lower.
 */
export function scoreEmphasisClarity(slide: SlideIR): number {
  const els = slide.elements;
  if (els.length === 0) return 0;
  if (els.length === 1) return 1;

  const total = slideArea(slide);
  const areas = els.map((el) => frameArea(el.frame));
  const maxArea = Math.max(...areas);
  const secondArea = areas.length >= 2 ? areas.sort((a, b) => b - a)[1]! : 0;

  // Title presence is a strong signal
  const hasTitle = els.some((el) => el.type === "text" && el.role === "title");

  // Clear focal: largest element is ≥ 1.5× the second-largest
  const ratio = secondArea > 0 ? maxArea / secondArea : 2;
  const focalScore = clamp01((ratio - 1) / 1.5); // 0 when equal, 1 when 2.5×

  // Area-share: focal element is a reasonable fraction of the slide
  const focalShare = total > 0 ? maxArea / total : 0;
  const shareScore = focalShare >= 0.1 && focalShare <= 0.6 ? 1 : 0.5;

  let score = focalScore * 0.5 + shareScore * 0.3;
  if (hasTitle) score += 0.2;

  return clamp01(score);
}
