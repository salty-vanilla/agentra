/**
 * Main entry point for deterministic layout quality scoring.
 *
 * Produces a `LayoutQualityReport` containing per-slide metrics, warnings,
 * a weighted composite score, and presentation-level summary statistics.
 */

import type { PresentationIR, SlideIR } from "#src/index.js";
import type {
  LayoutQualityMetrics,
  LayoutQualityReport,
  LayoutQualityWarning,
  LayoutQualityWarningCode,
  SlideLayoutQualityScore,
} from "./quality-types.js";
import {
  scoreWhitespaceBalance,
  scoreVisualHierarchy,
  scoreRegionUtilization,
  scoreAlignmentConsistency,
  scoreDensityComfort,
  scoreEmphasisClarity,
} from "./metric-scorers.js";
import {
  detectFlatVerticalComposition,
  detectExcessiveDensity,
  detectMissingHierarchy,
  detectTinyFrames,
  detectLowUtilization,
} from "./warning-detectors.js";
import { QUALITY_WEAK_SLIDE_THRESHOLD } from "./quality-thresholds.js";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/**
 * Metric weights for the composite slide score.
 *
 * `regionUtilization` is intentionally low — many well-designed slides
 * leave some layout regions intentionally empty.
 */
const METRIC_WEIGHTS: Record<keyof LayoutQualityMetrics, number> = {
  whitespaceBalance: 0.20,
  visualHierarchy: 0.25,
  regionUtilization: 0.05,
  alignmentConsistency: 0.15,
  densityComfort: 0.20,
  emphasisClarity: 0.15,
};

// ---------------------------------------------------------------------------
// Per-slide scoring
// ---------------------------------------------------------------------------

function scoreSlide(slide: SlideIR): SlideLayoutQualityScore {
  const metrics: LayoutQualityMetrics = {
    whitespaceBalance: scoreWhitespaceBalance(slide),
    visualHierarchy: scoreVisualHierarchy(slide),
    regionUtilization: scoreRegionUtilization(slide),
    alignmentConsistency: scoreAlignmentConsistency(slide),
    densityComfort: scoreDensityComfort(slide),
    emphasisClarity: scoreEmphasisClarity(slide),
  };

  // Weighted composite score
  let score = 0;
  for (const [key, weight] of Object.entries(METRIC_WEIGHTS)) {
    score += metrics[key as keyof LayoutQualityMetrics] * weight;
  }

  // Collect warnings
  const warnings: LayoutQualityWarning[] = [
    ...detectFlatVerticalComposition(slide),
    ...detectExcessiveDensity(slide),
    ...detectMissingHierarchy(slide),
    ...detectTinyFrames(slide),
    ...detectLowUtilization(slide),
  ];

  return {
    slideId: slide.id,
    score: Math.round(score * 1000) / 1000, // 3 decimal places
    metrics,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Presentation-level scoring
// ---------------------------------------------------------------------------

const ALL_WARNING_CODES: LayoutQualityWarningCode[] = [
  "flat-vertical-composition",
  "excessive-density",
  "missing-hierarchy",
  "tiny-frame",
  "low-utilization",
];

export function scoreLayoutQuality(presentation: PresentationIR): LayoutQualityReport {
  const slideScores = presentation.slides.map(scoreSlide);

  const scores = slideScores.map((s) => s.score);
  const averageScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000
      : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const weakSlideCount = slideScores.filter(
    (s) => s.score < QUALITY_WEAK_SLIDE_THRESHOLD,
  ).length;
  const flatVerticalCompositionCount = slideScores.filter((s) =>
    s.warnings.some((w) => w.code === "flat-vertical-composition"),
  ).length;

  const warningCountsByCode = Object.fromEntries(
    ALL_WARNING_CODES.map((code) => [
      code,
      slideScores.reduce(
        (sum, s) => sum + s.warnings.filter((w) => w.code === code).length,
        0,
      ),
    ]),
  ) as Record<LayoutQualityWarningCode, number>;

  return {
    slideScores,
    summary: {
      averageScore,
      minScore,
      weakSlideCount,
      flatVerticalCompositionCount,
      warningCountsByCode,
    },
  };
}
