import {
  countByType,
  hasCallout,
  isSummaryIntent,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { createMetricRail, splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ResolvedFrame } from "#src/index.js";

/**
 * Executive Summary KPI: 3–5 KPI/metric cards in a responsive grid with a
 * key-takeaway band and optional action cards.  Designed for performance
 * reports and management summaries.
 */
export const executiveSummaryKpiStrategy: LayoutStrategy = {
  id: "executive-summary-kpi",
  capability: "executive_summary_kpi",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    const metricCount = countByType(ctx.blocks, "metric");
    if (metricCount < 3) return false;
    if (ctx.blocks.length > 12) return false;
    return hasCallout(ctx.blocks) || isSummaryIntent(ctx);
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const otherBlocks = ctx.blocks.filter(
      (b) => b.type !== "metric" && b.type !== "callout",
    );

    const hasLowerContent = calloutBlocks.length > 0 || otherBlocks.length > 0;

    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots via helper
    const metrics = resolveSlotFrame(ctx, ["metrics", "cards"], region);
    const callout = resolveSlotFrame(ctx, "callout", region);

    if (!hasLowerContent) {
      // Metrics only — use full region
      const cells = createMetricRail(metrics.frame, metricBlocks.length, {
        minCardHeight: 120,
        maxCardHeight: 160,
        gap: 20,
      });
      metricBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: metrics,
            frame: cells[i] ?? metrics.frame,
            hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
          }),
        );
      });
      return assignments;
    }

    // --- Metrics + callout/other layout ---
    // Use fixed callout band height (90px) instead of ratio-based split.
    // This prevents the metric region from being squeezed and reduces
    // VLM layout repair operations.
    const CALLOUT_BAND_HEIGHT = 90;
    const GAP = 24;
    const lowerBlocks = [...calloutBlocks, ...otherBlocks];
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
    const cells = createMetricRail(computedMetrics.frame, metricBlocks.length, {
      minCardHeight: 120,
      maxCardHeight: 160,
      gap: 20,
    });
    metricBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedMetrics,
          frame: cells[i] ?? computedMetrics.frame,
          hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
        }),
      );
    });

    const computedCallout = callout.slot ? callout : { ...callout, frame: lowerRegion };
    const lowerFrames = splitVertical(computedCallout.frame, lowerBlocks.length, density);
    lowerBlocks.forEach((block, i) => {
      const isCallout = block.type === "callout";
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: isCallout ? computedCallout : { frame: lowerRegion, fallbackSlots: [] },
          frame: lowerFrames[i] ?? lowerRegion,
          hints: isCallout
            ? { role: "callout", decoration: "accent-bar", fontScale: 1.05 }
            : undefined,
        }),
      );
    });

    return assignments;
  },
};
