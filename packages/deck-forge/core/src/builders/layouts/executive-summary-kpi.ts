import {
  countByType,
  createCardGrid,
  hasCallout,
  isSummaryIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
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

    if (metricRatio >= 1.0) {
      // Metrics only — fill entire region
      const cells = createCardGrid(region, metricBlocks.length, density);
      metricBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: cells[i] ?? region,
          hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
        });
      });
      return assignments;
    }

    const { top: metricRegion, bottom: lowerRegion } = splitTopBottom(
      region,
      metricRatio,
    );

    // Metric cards in responsive grid
    const cells = createCardGrid(metricRegion, metricBlocks.length, density);
    metricBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: cells[i] ?? metricRegion,
        hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
      });
    });

    // Callout takeaway band + other blocks in lower region
    const lowerBlocks = [...calloutBlocks, ...otherBlocks];
    const lowerFrames = splitVertical(lowerRegion, lowerBlocks.length, density);
    lowerBlocks.forEach((block, i) => {
      const isCallout = block.type === "callout";
      assignments.push({
        blockId: block.id,
        frame: lowerFrames[i] ?? lowerRegion,
        hints: isCallout
          ? { role: "callout", decoration: "accent-bar", fontScale: 1.05 }
          : undefined,
      });
    });

    return assignments;
  },
};
