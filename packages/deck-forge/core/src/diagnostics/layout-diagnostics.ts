import type { PresentationIR, SlideIR, ElementIR } from "#src/index.js";
import { frameOverlapRatio } from "#src/geometry/frame-geometry.js";
import { isDecorativeElement } from "#src/operations/utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIAGNOSTIC_OVERLAP_THRESHOLD = 0.02;
const MAX_ELEMENT_COUNT = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlideLayoutDiagnostics = {
  slideId: string;
  slideIndex: number;
  title?: string;

  layoutStrategyId?: string;
  layoutSpecType?: string;

  templateProfileId?: string;
  templateLayoutId?: string;
  templateLayoutKind?: string;

  usedSlots: string[];
  fallbackSlots: string[];
  missingExpectedSlots: string[];

  elementCount: number;
  contentElementCount: number;

  overlapCount: number;
  maxOverlapRatio: number;

  outOfBoundsCount: number;

  emptySlotCount: number;
  slotCoverageRatio: number;

  warnings: LayoutDiagnosticWarning[];
};

export type LayoutDiagnosticWarning = {
  code:
    | "missing_template_trace"
    | "missing_expected_slot"
    | "slot_fallback"
    | "low_slot_coverage"
    | "element_overlap"
    | "element_out_of_bounds"
    | "too_many_elements"
    | "too_many_fallback_slots";
  severity: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
};

export type DeckLayoutDiagnosticsSummary = {
  slideCount: number;

  templateProfileIds: string[];
  templateLayoutUsage: Record<string, number>;
  layoutStrategyUsage: Record<string, number>;

  totalUsedSlots: number;
  totalFallbackSlots: number;
  fallbackSlotUsage: Record<string, number>;

  slidesWithFallbackSlots: number;
  slidesWithOverlaps: number;
  slidesWithOutOfBounds: number;

  totalOverlapCount: number;
  maxOverlapRatio: number;
  totalOutOfBoundsCount: number;

  averageSlotCoverageRatio: number;

  warningCount: number;
  errorCount: number;

  warningsByCode: Record<string, number>;

  deployReadiness: LayoutDeployReadiness;
};

export type LayoutDeployReadiness = {
  status: "pass" | "warning" | "fail";
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Slide-level diagnostics
// ---------------------------------------------------------------------------

export function analyzeSlideLayout(slide: SlideIR): SlideLayoutDiagnostics {
  const warnings: LayoutDiagnosticWarning[] = [];
  const trace = slide._trace;

  // Trace fields (safe defaults when missing)
  const usedSlots = trace?.usedSlots ?? [];
  const fallbackSlots = trace?.fallbackSlots ?? [];

  if (!trace) {
    warnings.push({
      code: "missing_template_trace",
      severity: "error",
      message: "Slide has no _trace metadata — layout diagnostics may be incomplete.",
    });
  }

  // Fallback slot warnings
  if (fallbackSlots.length > 0) {
    warnings.push({
      code: "slot_fallback",
      severity: "info",
      message: `Slot fallback used: ${fallbackSlots.join(", ")}`,
      details: { fallbackSlots },
    });
  }
  if (fallbackSlots.length >= 3) {
    warnings.push({
      code: "too_many_fallback_slots",
      severity: "warning",
      message: `${fallbackSlots.length} fallback slots used — template layout may be poorly matched.`,
      details: { fallbackSlots },
    });
  }

  // Slot coverage
  const totalSlotAttempts = usedSlots.length + fallbackSlots.length;
  const slotCoverageRatio =
    totalSlotAttempts > 0 ? usedSlots.length / totalSlotAttempts : 0;

  if (slotCoverageRatio < 0.5 && totalSlotAttempts > 0) {
    warnings.push({
      code: "low_slot_coverage",
      severity: "warning",
      message: `Low slot coverage: ${(slotCoverageRatio * 100).toFixed(0)}% (${usedSlots.length}/${totalSlotAttempts})`,
      details: { slotCoverageRatio, usedSlots, fallbackSlots },
    });
  }

  // Element counts
  const elements = slide.elements;
  const contentElements = elements.filter((el) => !isDecorativeElement(el));
  const elementCount = elements.length;
  const contentElementCount = contentElements.length;

  if (elementCount > MAX_ELEMENT_COUNT) {
    warnings.push({
      code: "too_many_elements",
      severity: "warning",
      message: `Slide has ${elementCount} elements (threshold: ${MAX_ELEMENT_COUNT}).`,
      details: { elementCount, threshold: MAX_ELEMENT_COUNT },
    });
  }

  // Overlap detection (content elements only)
  let overlapCount = 0;
  let maxOverlapRatio = 0;
  for (let i = 0; i < contentElements.length; i++) {
    for (let j = i + 1; j < contentElements.length; j++) {
      const ratio = frameOverlapRatio(contentElements[i]!.frame, contentElements[j]!.frame);
      if (ratio >= DIAGNOSTIC_OVERLAP_THRESHOLD) {
        overlapCount++;
        if (ratio > maxOverlapRatio) {
          maxOverlapRatio = ratio;
        }
      }
    }
  }

  if (overlapCount > 0) {
    warnings.push({
      code: "element_overlap",
      severity: "warning",
      message: `${overlapCount} element overlap(s) detected (max ratio: ${maxOverlapRatio.toFixed(3)}).`,
      details: { overlapCount, maxOverlapRatio },
    });
  }

  // Out-of-bounds detection
  const slideSize = slide.layout.slideSize;
  let outOfBoundsCount = 0;
  for (const el of elements) {
    if (
      el.frame.x < 0 ||
      el.frame.y < 0 ||
      el.frame.x + el.frame.width > slideSize.width ||
      el.frame.y + el.frame.height > slideSize.height
    ) {
      outOfBoundsCount++;
    }
  }

  if (outOfBoundsCount > 0) {
    warnings.push({
      code: "element_out_of_bounds",
      severity: "error",
      message: `${outOfBoundsCount} element(s) out of slide bounds.`,
      details: { outOfBoundsCount },
    });
  }

  // Missing expected slots — slots that ended up as fallback
  const missingExpectedSlots = [...fallbackSlots].sort();

  for (const slot of missingExpectedSlots) {
    warnings.push({
      code: "missing_expected_slot",
      severity: "info",
      message: `Expected slot "${slot}" was not available in template layout.`,
      details: { slot },
    });
  }

  return {
    slideId: slide.id,
    slideIndex: slide.index,
    title: slide.title,

    layoutStrategyId: trace?.layoutStrategyId,
    layoutSpecType: trace?.layoutSpecType,

    templateProfileId: trace?.templateProfileId,
    templateLayoutId: trace?.templateLayoutId,
    templateLayoutKind: trace?.templateLayoutKind,

    usedSlots: [...usedSlots].sort(),
    fallbackSlots: [...fallbackSlots].sort(),
    missingExpectedSlots,

    elementCount,
    contentElementCount,

    overlapCount,
    maxOverlapRatio,

    outOfBoundsCount,

    emptySlotCount: fallbackSlots.length,
    slotCoverageRatio,

    warnings,
  };
}

// ---------------------------------------------------------------------------
// Deck-level diagnostics
// ---------------------------------------------------------------------------

export function analyzeDeckLayout(presentation: PresentationIR): {
  slides: SlideLayoutDiagnostics[];
  summary: DeckLayoutDiagnosticsSummary;
} {
  const slides = presentation.slides.map((s) => analyzeSlideLayout(s));

  const templateProfileIds = new Set<string>();
  const templateLayoutUsage: Record<string, number> = {};
  const layoutStrategyUsage: Record<string, number> = {};
  const fallbackSlotUsage: Record<string, number> = {};

  let totalUsedSlots = 0;
  let totalFallbackSlots = 0;
  let slidesWithFallbackSlots = 0;
  let slidesWithOverlaps = 0;
  let slidesWithOutOfBounds = 0;
  let totalOverlapCount = 0;
  let maxOverlapRatio = 0;
  let totalOutOfBoundsCount = 0;
  let totalSlotCoverage = 0;

  let warningCount = 0;
  let errorCount = 0;
  const warningsByCode: Record<string, number> = {};

  for (const diag of slides) {
    if (diag.templateProfileId) {
      templateProfileIds.add(diag.templateProfileId);
    }
    if (diag.templateLayoutKind) {
      templateLayoutUsage[diag.templateLayoutKind] =
        (templateLayoutUsage[diag.templateLayoutKind] ?? 0) + 1;
    }
    if (diag.layoutStrategyId) {
      layoutStrategyUsage[diag.layoutStrategyId] =
        (layoutStrategyUsage[diag.layoutStrategyId] ?? 0) + 1;
    }

    totalUsedSlots += diag.usedSlots.length;
    totalFallbackSlots += diag.fallbackSlots.length;

    for (const slot of diag.fallbackSlots) {
      fallbackSlotUsage[slot] = (fallbackSlotUsage[slot] ?? 0) + 1;
    }

    if (diag.fallbackSlots.length > 0) slidesWithFallbackSlots++;
    if (diag.overlapCount > 0) slidesWithOverlaps++;
    if (diag.outOfBoundsCount > 0) slidesWithOutOfBounds++;

    totalOverlapCount += diag.overlapCount;
    if (diag.maxOverlapRatio > maxOverlapRatio) {
      maxOverlapRatio = diag.maxOverlapRatio;
    }
    totalOutOfBoundsCount += diag.outOfBoundsCount;
    totalSlotCoverage += diag.slotCoverageRatio;

    for (const w of diag.warnings) {
      if (w.severity === "error") errorCount++;
      else warningCount++;
      warningsByCode[w.code] = (warningsByCode[w.code] ?? 0) + 1;
    }
  }

  const slideCount = slides.length;
  const averageSlotCoverageRatio = slideCount > 0 ? totalSlotCoverage / slideCount : 0;

  const summary: DeckLayoutDiagnosticsSummary = {
    slideCount,
    templateProfileIds: [...templateProfileIds].sort(),
    templateLayoutUsage,
    layoutStrategyUsage,
    totalUsedSlots,
    totalFallbackSlots,
    fallbackSlotUsage,
    slidesWithFallbackSlots,
    slidesWithOverlaps,
    slidesWithOutOfBounds,
    totalOverlapCount,
    maxOverlapRatio,
    totalOutOfBoundsCount,
    averageSlotCoverageRatio,
    warningCount,
    errorCount,
    warningsByCode,
    deployReadiness: computeDeployReadiness(summary_partial()),
  };

  return { slides, summary };

  // Helper to build a partial summary for readiness computation
  function summary_partial() {
    return {
      slideCount,
      totalOutOfBoundsCount,
      maxOverlapRatio,
      slidesWithOverlaps,
      averageSlotCoverageRatio,
      totalFallbackSlots,
      slidesWithFallbackSlots,
      warningCount,
    };
  }
}

// ---------------------------------------------------------------------------
// Deploy readiness
// ---------------------------------------------------------------------------

function computeDeployReadiness(summary: {
  slideCount: number;
  totalOutOfBoundsCount: number;
  maxOverlapRatio: number;
  slidesWithOverlaps: number;
  averageSlotCoverageRatio: number;
  totalFallbackSlots: number;
  slidesWithFallbackSlots: number;
  warningCount: number;
}): LayoutDeployReadiness {
  const reasons: string[] = [];

  // Fail conditions
  if (summary.totalOutOfBoundsCount > 0) {
    reasons.push(`${summary.totalOutOfBoundsCount} element(s) out of bounds`);
  }
  if (summary.maxOverlapRatio >= 0.15) {
    reasons.push(`Max overlap ratio ${summary.maxOverlapRatio.toFixed(3)} >= 0.15`);
  }
  if (summary.slidesWithOverlaps >= 3) {
    reasons.push(`${summary.slidesWithOverlaps} slides with overlaps (>= 3)`);
  }
  if (summary.averageSlotCoverageRatio < 0.35 && summary.slideCount > 0) {
    reasons.push(
      `Average slot coverage ${(summary.averageSlotCoverageRatio * 100).toFixed(0)}% < 35%`,
    );
  }

  if (reasons.length > 0) {
    return { status: "fail", reasons };
  }

  // Warning conditions
  const warningReasons: string[] = [];
  if (summary.totalFallbackSlots >= summary.slideCount * 2) {
    warningReasons.push(
      `${summary.totalFallbackSlots} total fallback slots (>= ${summary.slideCount * 2})`,
    );
  }
  if (summary.slidesWithFallbackSlots >= summary.slideCount / 2 && summary.slideCount > 0) {
    warningReasons.push(
      `${summary.slidesWithFallbackSlots} slides with fallback slots (>= ${Math.floor(summary.slideCount / 2)})`,
    );
  }
  if (summary.warningCount > 0) {
    warningReasons.push(`${summary.warningCount} warning(s)`);
  }
  if (summary.maxOverlapRatio >= 0.05) {
    warningReasons.push(`Max overlap ratio ${summary.maxOverlapRatio.toFixed(3)} >= 0.05`);
  }

  if (warningReasons.length > 0) {
    return { status: "warning", reasons: warningReasons };
  }

  return { status: "pass", reasons: [] };
}
