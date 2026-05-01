import {
  countByType,
  createCardGrid,
  hasCallout,
  isSummaryIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

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

    const hasOthers = otherBlocks.length > 0;
    const hasCallouts = calloutBlocks.length > 0;

    // Determine vertical split ratios based on content composition
    let metricRatio: number;
    if (hasCallouts && hasOthers) {
      metricRatio = 0.45;
    } else if (hasCallouts || hasOthers) {
      metricRatio = 0.55;
    } else {
      metricRatio = 1.0;
    }

    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots via helper
    const metrics = resolveSlotFrame(ctx, ["metrics", "cards"], region);
    const callout = resolveSlotFrame(ctx, "callout", region);

    if (metricRatio >= 1.0) {
      const cells = createCardGrid(metrics.frame, metricBlocks.length, density);
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

    const { top: metricRegion, bottom: lowerRegion } = splitTopBottom(
      region,
      metricRatio,
    );

    const computedMetrics = metrics.slot ? metrics : { ...metrics, frame: metricRegion };
    const cells = createCardGrid(computedMetrics.frame, metricBlocks.length, density);
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

    const lowerBlocks = [...calloutBlocks, ...otherBlocks];
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
