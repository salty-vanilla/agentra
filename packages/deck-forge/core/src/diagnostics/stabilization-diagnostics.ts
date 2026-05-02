import type { PresentationIR } from "#src/index.js";
import {
  analyzeDeckLayout,
  type DeckLayoutDiagnosticsSummary,
  type SlideLayoutDiagnostics,
} from "#src/diagnostics/layout-diagnostics.js";
import {
  analyzeOperationLog,
  type OperationDiagnosticsSummary,
  type OperationRepairCategory,
} from "#src/diagnostics/operation-diagnostics.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeckStabilizationDiagnostics = {
  layout: DeckLayoutDiagnosticsSummary;
  operations: OperationDiagnosticsSummary;
  assetUsage: AssetUsageDiagnostics;

  status: "stable" | "needs_attention" | "unstable";

  /** 0–100 score. Higher is better. */
  score: number;

  reasons: string[];

  hotspots: SlideStabilizationHotspot[];

  recommendations: StabilizationRecommendation[];
};

export type AssetUsageDiagnostics = {
  totalAssets: number;
  imageAssetCount: number;
  imageElementCount: number;
  usedAssetCount: number;
  unusedAssetCount: number;
  unusedAssetIds: string[];
};

export type SlideStabilizationHotspot = {
  slideId: string;
  slideIndex?: number;
  title?: string;

  templateLayoutId?: string;
  templateLayoutKind?: string;
  layoutStrategyId?: string;

  operationCount: number;
  layoutRepairOperationCount: number;
  visualPolishOperationCount: number;
  contentRewriteOperationCount: number;

  hasFallbackSlots: boolean;
  fallbackSlots: string[];

  overlapCount: number;
  outOfBoundsCount: number;

  severity: "info" | "warning" | "error";
  reasons: string[];
};

export type StabilizationRecommendation = {
  code:
    | "reduce_layout_repair"
    | "fix_template_slots"
    | "split_dense_slide"
    | "add_template_layout"
    | "improve_renderer_variant"
    | "review_strategy_mapping"
    | "ready_for_phase_8";

  severity: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export function analyzeDeckStabilization(input: {
  presentation: PresentationIR;
}): DeckStabilizationDiagnostics {
  const { presentation } = input;

  const { slides: slideDiags, summary: layout } = analyzeDeckLayout(presentation);
  const operations = analyzeOperationLog(presentation.operationLog);

  const slideCount = layout.slideCount;
  const reasons: string[] = [];

  // ------ Score (deduction-based) ------
  let score = 100;

  if (operations.totalOperations > slideCount * 12) {
    score -= 20;
    reasons.push(
      `Total operations (${operations.totalOperations}) > ${slideCount * 12} (slideCount×12)`,
    );
  } else if (operations.totalOperations > slideCount * 8) {
    score -= 10;
    reasons.push(
      `Total operations (${operations.totalOperations}) > ${slideCount * 8} (slideCount×8)`,
    );
  }

  if (operations.layoutRepairRatio > 0.5) {
    score -= 25;
    reasons.push(
      `Layout repair ratio ${(operations.layoutRepairRatio * 100).toFixed(0)}% > 50%`,
    );
  } else if (operations.layoutRepairRatio > 0.35) {
    score -= 15;
    reasons.push(
      `Layout repair ratio ${(operations.layoutRepairRatio * 100).toFixed(0)}% > 35%`,
    );
  }

  if (layout.slidesWithFallbackSlots > 0) {
    score -= 5;
    reasons.push(
      `${layout.slidesWithFallbackSlots} slide(s) with fallback slots`,
    );
  }

  if (layout.slidesWithOverlaps > 0) {
    score -= 10;
    reasons.push(
      `${layout.slidesWithOverlaps} slide(s) with overlaps`,
    );
  }

  if (layout.totalOutOfBoundsCount > 0) {
    score -= 30;
    reasons.push(
      `${layout.totalOutOfBoundsCount} element(s) out of bounds`,
    );
  }

  if (layout.deployReadiness.status === "fail") {
    score -= 40;
    reasons.push(`Deploy readiness: fail`);
  } else if (layout.deployReadiness.status === "warning") {
    score -= 10;
    reasons.push(`Deploy readiness: warning`);
  }

  score = Math.max(0, Math.min(100, score));

  // ------ Status ------
  const status: DeckStabilizationDiagnostics["status"] =
    score >= 80 ? "stable" : score >= 55 ? "needs_attention" : "unstable";

  // ------ Hotspots ------
  const hotspots = buildHotspots(slideDiags, operations);

  // ------ Recommendations ------
  const recommendations = buildRecommendations(layout, operations, hotspots, score);

  // ------ Asset usage ------
  const assetUsage = analyzeAssetUsage(presentation);

  return {
    layout,
    operations,
    assetUsage,
    status,
    score,
    reasons,
    hotspots,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Asset usage analysis
// ---------------------------------------------------------------------------

function analyzeAssetUsage(presentation: PresentationIR): AssetUsageDiagnostics {
  const allAssets = presentation.assets?.assets ?? [];
  const imageAssets = allAssets.filter((a) => a.type === "image");

  // Collect all assetIds referenced by image elements across slides
  const referencedAssetIds = new Set<string>();
  let imageElementCount = 0;
  for (const slide of presentation.slides) {
    for (const el of slide.elements) {
      if (el.type === "image") {
        imageElementCount++;
        if (el.assetId) referencedAssetIds.add(el.assetId);
      }
    }
  }

  const unusedAssetIds = allAssets
    .filter((a) => !referencedAssetIds.has(a.id))
    .map((a) => a.id);

  return {
    totalAssets: allAssets.length,
    imageAssetCount: imageAssets.length,
    imageElementCount,
    usedAssetCount: allAssets.length - unusedAssetIds.length,
    unusedAssetCount: unusedAssetIds.length,
    unusedAssetIds,
  };
}

// ---------------------------------------------------------------------------
// Hotspots
// ---------------------------------------------------------------------------

function buildHotspots(
  slideDiags: SlideLayoutDiagnostics[],
  operations: OperationDiagnosticsSummary,
): SlideStabilizationHotspot[] {
  const hotspots: SlideStabilizationHotspot[] = [];

  // Compute per-slide repair category counts from operationsBySlideId
  // We only have slide-level op counts from the summary, but we can use
  // the overall ratios to estimate per-slide breakdowns.
  const totalOps = operations.totalOperations || 1;

  for (const diag of slideDiags) {
    const slideOps = operations.operationsBySlideId[diag.slideId] ?? 0;
    const slideReasons: string[] = [];

    // Estimate per-slide category counts proportionally
    const layoutRepairOps = Math.round(slideOps * operations.layoutRepairRatio);
    const visualPolishOps = Math.round(slideOps * operations.visualPolishRatio);
    const contentRewriteOps = Math.round(slideOps * operations.contentRewriteRatio);

    // Determine severity
    let severity: SlideStabilizationHotspot["severity"] = "info";

    if (slideOps > 10) {
      severity = "error";
      slideReasons.push(`High operation count: ${slideOps}`);
    } else if (slideOps > 5) {
      severity = "warning";
      slideReasons.push(`Elevated operation count: ${slideOps}`);
    }

    if (diag.fallbackSlots.length > 0) {
      if (severity === "info") severity = "warning";
      slideReasons.push(`Fallback slots: ${diag.fallbackSlots.join(", ")}`);
    }

    if (diag.overlapCount > 0) {
      if (severity === "info") severity = "warning";
      slideReasons.push(`${diag.overlapCount} overlap(s)`);
    }

    if (diag.outOfBoundsCount > 0) {
      severity = "error";
      slideReasons.push(`${diag.outOfBoundsCount} element(s) out of bounds`);
    }

    if (diag.elementCount > 12) {
      if (severity === "info") severity = "warning";
      slideReasons.push(`Dense slide: ${diag.elementCount} elements`);
    }

    if (diag.slotCoverageRatio < 0.5 && (diag.usedSlots.length + diag.fallbackSlots.length) > 0) {
      if (severity === "info") severity = "warning";
      slideReasons.push(
        `Low slot coverage: ${(diag.slotCoverageRatio * 100).toFixed(0)}%`,
      );
    }

    // Only include slides with actual issues
    if (slideReasons.length === 0) continue;

    hotspots.push({
      slideId: diag.slideId,
      slideIndex: diag.slideIndex,
      title: diag.title,
      templateLayoutId: diag.templateLayoutId,
      templateLayoutKind: diag.templateLayoutKind,
      layoutStrategyId: diag.layoutStrategyId,
      operationCount: slideOps,
      layoutRepairOperationCount: layoutRepairOps,
      visualPolishOperationCount: visualPolishOps,
      contentRewriteOperationCount: contentRewriteOps,
      hasFallbackSlots: diag.fallbackSlots.length > 0,
      fallbackSlots: [...diag.fallbackSlots],
      overlapCount: diag.overlapCount,
      outOfBoundsCount: diag.outOfBoundsCount,
      severity,
      reasons: slideReasons,
    });
  }

  // Sort by severity (error first), then by operation count descending
  const severityOrder = { error: 0, warning: 1, info: 2 };
  hotspots.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.operationCount - a.operationCount;
  });

  return hotspots;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function buildRecommendations(
  layout: DeckLayoutDiagnosticsSummary,
  operations: OperationDiagnosticsSummary,
  hotspots: SlideStabilizationHotspot[],
  score: number,
): StabilizationRecommendation[] {
  const recs: StabilizationRecommendation[] = [];

  if (operations.layoutRepairRatio > 0.35) {
    recs.push({
      code: "reduce_layout_repair",
      severity: operations.layoutRepairRatio > 0.5 ? "error" : "warning",
      message: `Layout repair operations account for ${(operations.layoutRepairRatio * 100).toFixed(0)}% of all operations. Improve initial layout placement.`,
      details: {
        layoutRepairRatio: operations.layoutRepairRatio,
        layoutRepairCount:
          operations.operationsByRepairCategory.layout_frame +
          operations.operationsByRepairCategory.layout_position +
          operations.operationsByRepairCategory.layout_size,
      },
    });
  }

  if (layout.slidesWithFallbackSlots > 0) {
    recs.push({
      code: "fix_template_slots",
      severity: "warning",
      message: `${layout.slidesWithFallbackSlots} slide(s) used fallback slots. Consider adding dedicated template layouts.`,
      details: {
        slidesWithFallbackSlots: layout.slidesWithFallbackSlots,
        fallbackSlotUsage: layout.fallbackSlotUsage,
      },
    });
  }

  const denseSlides = hotspots.filter(
    (h) => h.reasons.some((r) => r.startsWith("Dense slide")),
  );
  if (denseSlides.length > 0) {
    recs.push({
      code: "split_dense_slide",
      severity: "warning",
      message: `${denseSlides.length} slide(s) have too many elements. Consider splitting content across multiple slides.`,
      details: {
        slideIds: denseSlides.map((h) => h.slideId),
      },
    });
  }

  if (operations.visualPolishRatio > 0.3) {
    recs.push({
      code: "improve_renderer_variant",
      severity: "info",
      message: `Visual polish operations account for ${(operations.visualPolishRatio * 100).toFixed(0)}% of operations. Renderer variants could reduce this.`,
      details: { visualPolishRatio: operations.visualPolishRatio },
    });
  }

  // Check if any strategy mapping is problematic (high fallback for specific strategies)
  const strategiesWithFallback = hotspots.filter((h) => h.hasFallbackSlots && h.layoutStrategyId);
  if (strategiesWithFallback.length > 0) {
    const uniqueStrategies = [
      ...new Set(strategiesWithFallback.map((h) => h.layoutStrategyId!)),
    ];
    recs.push({
      code: "review_strategy_mapping",
      severity: "warning",
      message: `Strategy mappings may be suboptimal for: ${uniqueStrategies.join(", ")}`,
      details: { strategies: uniqueStrategies },
    });
  }

  if (score >= 80 && recs.length === 0) {
    recs.push({
      code: "ready_for_phase_8",
      severity: "info",
      message: "Deck is stable. Ready to proceed with renderer variant and style guide improvements.",
    });
  }

  return recs;
}
