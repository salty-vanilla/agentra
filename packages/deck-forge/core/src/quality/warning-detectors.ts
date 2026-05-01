/**
 * Warning detectors for layout quality analysis.
 *
 * Each detector returns an array of warnings for a single slide.
 */

import type { SlideIR, TextElementIR } from "#src/index.js";
import type { LayoutQualityWarning } from "./quality-types.js";
import {
  QUALITY_MAX_COMFORTABLE_TABLE_CELLS,
  QUALITY_MAX_COMFORTABLE_TABLE_ROWS,
  QUALITY_MAX_COMFORTABLE_TABLE_COLUMNS,
  QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT,
  QUALITY_MIN_UTILIZATION_RATIO,
  QUALITY_TINY_FRAME_RATIO,
  QUALITY_ALIGNMENT_TOLERANCE_PX,
} from "./quality-thresholds.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slideArea(slide: SlideIR): number {
  return slide.layout.slideSize.width * slide.layout.slideSize.height;
}

function frameArea(x: { width: number; height: number }): number {
  return x.width * x.height;
}

// ---------------------------------------------------------------------------
// 1. Flat vertical composition
// ---------------------------------------------------------------------------

/**
 * Detects slides that appear to be simple vertical stacks without any
 * grid/card/side-by-side structure or a prominent focal element.
 *
 * To avoid over-firing on legitimate single-column layouts this requires
 * ALL of the following:
 * - ≥ 3 elements
 * - All elements share a similar x position (within tolerance)
 * - All elements have similar widths (within 15 % of the widest)
 * - Elements are sorted top-to-bottom with no horizontal offset
 * - No single element occupies ≥ 30 % of the slide area (focal element)
 */
export function detectFlatVerticalComposition(slide: SlideIR): LayoutQualityWarning[] {
  const els = slide.elements;
  if (els.length < 3) return [];

  const tolerance = QUALITY_ALIGNMENT_TOLERANCE_PX;
  const referenceX = els[0]!.frame.x;
  const maxWidth = Math.max(...els.map((el) => el.frame.width));
  const total = slideArea(slide);

  // Condition 1: all share similar x
  const allSameX = els.every((el) => Math.abs(el.frame.x - referenceX) <= tolerance);
  if (!allSameX) return [];

  // Condition 2: all have similar width (within 15 % of widest)
  const widthThreshold = maxWidth * 0.15;
  const allSameWidth = els.every((el) => Math.abs(el.frame.width - maxWidth) <= widthThreshold);
  if (!allSameWidth) return [];

  // Condition 3: no large focal element
  const hasFocal = els.some((el) => total > 0 && frameArea(el.frame) / total >= 0.3);
  if (hasFocal) return [];

  // Condition 4: all stacked vertically (sorted by y, no side-by-side pairs)
  const sorted = [...els].sort((a, b) => a.frame.y - b.frame.y);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    // If two elements overlap vertically they are side-by-side → not flat stack
    if (curr.frame.y < prev.frame.y + prev.frame.height - tolerance) {
      return [];
    }
  }

  return [
    {
      code: "flat-vertical-composition",
      severity: "warning",
      message: `Slide "${slide.id}" has ${els.length} elements in a flat vertical stack with no grid, side-by-side, or focal structure.`,
      slideId: slide.id,
    },
  ];
}

// ---------------------------------------------------------------------------
// 2. Excessive density
// ---------------------------------------------------------------------------

export function detectExcessiveDensity(slide: SlideIR): LayoutQualityWarning[] {
  const warnings: LayoutQualityWarning[] = [];

  if (slide.elements.length > QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT) {
    warnings.push({
      code: "excessive-density",
      severity: "warning",
      message: `Slide "${slide.id}" has ${slide.elements.length} elements (comfort limit: ${QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT}).`,
      slideId: slide.id,
    });
  }

  for (const el of slide.elements) {
    if (el.type === "table") {
      const cells = el.headers.length * el.rows.length;
      if (cells > QUALITY_MAX_COMFORTABLE_TABLE_CELLS) {
        warnings.push({
          code: "excessive-density",
          severity: "critical",
          message: `Table "${el.id}" has ${cells} cells (comfort limit: ${QUALITY_MAX_COMFORTABLE_TABLE_CELLS}).`,
          slideId: slide.id,
          elementId: el.id,
        });
      } else if (
        el.rows.length > QUALITY_MAX_COMFORTABLE_TABLE_ROWS ||
        el.headers.length > QUALITY_MAX_COMFORTABLE_TABLE_COLUMNS
      ) {
        warnings.push({
          code: "excessive-density",
          severity: "warning",
          message: `Table "${el.id}" has ${el.rows.length} rows × ${el.headers.length} columns.`,
          slideId: slide.id,
          elementId: el.id,
        });
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// 3. Missing hierarchy
// ---------------------------------------------------------------------------

export function detectMissingHierarchy(slide: SlideIR): LayoutQualityWarning[] {
  const texts = slide.elements.filter(
    (el): el is TextElementIR => el.type === "text",
  );
  if (texts.length <= 1) return [];

  const hasTitle = texts.some((t) => t.role === "title");
  if (!hasTitle) {
    return [
      {
        code: "missing-hierarchy",
        severity: "info",
        message: `Slide "${slide.id}" has ${texts.length} text elements but no title role.`,
        slideId: slide.id,
      },
    ];
  }

  // Check if all text elements share the same font size
  const fontSizes = new Set(texts.map((t) => t.style.fontSize ?? 18));
  if (fontSizes.size === 1) {
    return [
      {
        code: "missing-hierarchy",
        severity: "warning",
        message: `Slide "${slide.id}" has ${texts.length} text elements all at the same font size (${[...fontSizes][0]}px).`,
        slideId: slide.id,
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// 4. Tiny frames
// ---------------------------------------------------------------------------

export function detectTinyFrames(slide: SlideIR): LayoutQualityWarning[] {
  const total = slideArea(slide);
  if (total === 0) return [];

  const warnings: LayoutQualityWarning[] = [];
  for (const el of slide.elements) {
    const ratio = frameArea(el.frame) / total;
    if (ratio < QUALITY_TINY_FRAME_RATIO) {
      warnings.push({
        code: "tiny-frame",
        severity: "info",
        message: `Element "${el.id}" occupies only ${(ratio * 100).toFixed(1)}% of the slide area.`,
        slideId: slide.id,
        elementId: el.id,
      });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// 5. Low utilization
// ---------------------------------------------------------------------------

export function detectLowUtilization(slide: SlideIR): LayoutQualityWarning[] {
  const total = slideArea(slide);
  if (total === 0) return [];

  const occupied = slide.elements.reduce((sum, el) => sum + frameArea(el.frame), 0);
  const ratio = occupied / total;

  if (ratio < QUALITY_MIN_UTILIZATION_RATIO) {
    return [
      {
        code: "low-utilization",
        severity: "warning",
        message: `Slide "${slide.id}" uses only ${(ratio * 100).toFixed(1)}% of the slide area (threshold: ${(QUALITY_MIN_UTILIZATION_RATIO * 100).toFixed(0)}%).`,
        slideId: slide.id,
      },
    ];
  }

  return [];
}
