import {
  countByType,
  hasCallout,
  isSummaryIntent,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import {
  layoutMetricRail,
  layoutBottomCallout,
  layoutSidecarStack,
} from "#src/builders/layouts/primitives/index.js";
import { normalizeKpiSummaryContent } from "#src/normalizers/normalize-kpi-summary.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { KpiCardOverviewInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock, ResolvedFrame } from "#src/index.js";

/**
 * KPI Card Overview: 3–5 KPI/metric cards in a responsive grid with a
 * key-takeaway band and optional action cards.  Designed for performance
 * reports and management summaries.
 *
 * Phase 7.8: Uses normalizeKpiSummaryContent + layout primitives
 * (layoutMetricRail / layoutBottomCallout / layoutSidecarStack) for
 * deterministic, overlap-free placement.
 */
export const kpiCardOverviewStrategy: LayoutStrategy = {
  id: "kpi-card-overview",
  capability: "kpi_card_overview",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    // Native path: valid strategyInput for this strategy
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<KpiCardOverviewInput>({ strategyId: "kpi-card-overview", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    const metricCount = countByType(ctx.blocks, "metric");
    if (metricCount < 3) return false;
    if (ctx.blocks.length > 12) return false;
    return hasCallout(ctx.blocks) || isSummaryIntent(ctx);
  },

  layout(ctx: LayoutContext): LayoutResult {
    // Try native StrategyInput path
    const sir = readStrategyInput<KpiCardOverviewInput>({ strategyId: "kpi-card-overview", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      for (const [i, m] of inp.metrics.entries()) {
        syntheticBlocks.push({
          id: `si-metric-${i}`,
          type: "metric",
          label: m.label,
          value: m.value,
          unit: m.unit,
          trend: m.trend === "unknown" || m.trend === "mixed" ? undefined : m.trend,
        });
      }
      if (inp.keyTakeaway) {
        syntheticBlocks.push({ id: "si-callout-0", type: "callout", text: inp.keyTakeaway, tone: "info" });
      }
      // Run existing layout on synthetic blocks
      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }

    // Legacy fallback
    const assignments = layoutBlocks(ctx);
    return { assignments, strategyInputMode: sir.mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
    const region = mergeAllRegions(ctx);

    // Normalize blocks into semantic groups
    const normalized = normalizeKpiSummaryContent(ctx.blocks);
    const hasLowerContent = !!normalized.insight || normalized.supporting.length > 0;

    // Resolve template slots
    const metrics = resolveSlotFrame(ctx, ["metrics", "cards"], region);
    const callout = resolveSlotFrame(ctx, "callout", region);

    if (!hasLowerContent) {
      // Metrics only — use full region via primitive
      return layoutMetricRail({
        region: metrics.frame,
        blocks: normalized.metrics,
        density: ctx.layoutSpec.density,
      }).map((a) =>
        assignmentFromSlot({
          blockId: a.blockId,
          resolution: metrics,
          frame: a.frame,
          hints: a.hints,
        }),
      );
    }

    // --- Metrics + insight/supporting layout using primitives ---
    const CALLOUT_BAND_HEIGHT = 90;
    const GAP = 24;
    const lowerBlocks = [
      ...(normalized.insight ? [normalized.insight] : []),
      ...normalized.supporting,
    ];
    const lowerBandHeight = Math.max(
      CALLOUT_BAND_HEIGHT,
      lowerBlocks.length * 60,
    );

    const metricRegion: ResolvedFrame = metrics.slot
      ? metrics.frame
      : {
          x: region.x,
          y: region.y,
          width: region.width,
          height: Math.max(140, region.height - lowerBandHeight - GAP),
        };
    const lowerRegion: ResolvedFrame = {
      x: region.x,
      y: metricRegion.y + metricRegion.height + GAP,
      width: region.width,
      height: lowerBandHeight,
    };

    const computedMetrics = metrics.slot ? metrics : { ...metrics, frame: metricRegion };
    const computedCallout = callout.slot ? callout : { ...callout, frame: lowerRegion };

    const assignments: SubFrameAssignment[] = [];

    // Metric rail primitive
    const metricAssignments = layoutMetricRail({
      region: computedMetrics.frame,
      blocks: normalized.metrics,
      density: ctx.layoutSpec.density,
    });
    for (const a of metricAssignments) {
      assignments.push(
        assignmentFromSlot({
          blockId: a.blockId,
          resolution: computedMetrics,
          frame: a.frame,
          hints: a.hints,
        }),
      );
    }

    // Insight callout primitive
    if (normalized.insight) {
      const calloutAssignments = layoutBottomCallout({
        region: computedCallout.frame,
        block: normalized.insight,
        height: CALLOUT_BAND_HEIGHT,
      });
      for (const a of calloutAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: computedCallout,
            frame: a.frame,
            hints: a.hints,
          }),
        );
      }
    }

    // Supporting blocks via sidecar stack
    if (normalized.supporting.length > 0) {
      const supportingRegion: ResolvedFrame = normalized.insight
        ? {
            x: lowerRegion.x,
            y: lowerRegion.y + CALLOUT_BAND_HEIGHT + 8,
            width: lowerRegion.width,
            height: Math.max(60, lowerRegion.height - CALLOUT_BAND_HEIGHT - 8),
          }
        : lowerRegion;
      const sidecarAssignments = layoutSidecarStack({
        region: supportingRegion,
        blocks: normalized.supporting,
        density: ctx.layoutSpec.density,
      });
      for (const a of sidecarAssignments) {
        assignments.push(
          assignmentFromSlot({
            blockId: a.blockId,
            resolution: { frame: supportingRegion, fallbackSlots: [] },
            frame: a.frame,
          }),
        );
      }
    }

    return assignments;
}
