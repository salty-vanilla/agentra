/**
 * Layout quality evaluation types.
 *
 * These are separate from validation (structural correctness) — quality
 * answers "is the slide visually good?" rather than "is it broken?".
 */

// ---------------------------------------------------------------------------
// Warning severity
// ---------------------------------------------------------------------------

export type LayoutQualityWarningSeverity = "info" | "warning" | "critical";

// ---------------------------------------------------------------------------
// Warning codes
// ---------------------------------------------------------------------------

export type LayoutQualityWarningCode =
  | "flat-vertical-composition"
  | "excessive-density"
  | "missing-hierarchy"
  | "tiny-frame"
  | "low-utilization";

// ---------------------------------------------------------------------------
// Warning
// ---------------------------------------------------------------------------

export type LayoutQualityWarning = {
  code: LayoutQualityWarningCode;
  severity: LayoutQualityWarningSeverity;
  message: string;
  slideId: string;
  elementId?: string;
};

// ---------------------------------------------------------------------------
// Per-slide metrics (each 0–1, higher is better)
// ---------------------------------------------------------------------------

export type LayoutQualityMetrics = {
  whitespaceBalance: number;
  visualHierarchy: number;
  regionUtilization: number;
  alignmentConsistency: number;
  densityComfort: number;
  emphasisClarity: number;
};

// ---------------------------------------------------------------------------
// Per-slide score
// ---------------------------------------------------------------------------

export type SlideLayoutQualityScore = {
  slideId: string;
  score: number;
  metrics: LayoutQualityMetrics;
  warnings: LayoutQualityWarning[];
};

// ---------------------------------------------------------------------------
// Presentation-level report
// ---------------------------------------------------------------------------

export type LayoutQualityReport = {
  slideScores: SlideLayoutQualityScore[];
  summary: {
    averageScore: number;
    minScore: number;
    weakSlideCount: number;
    flatVerticalCompositionCount: number;
    warningCountsByCode: Record<LayoutQualityWarningCode, number>;
  };
};
