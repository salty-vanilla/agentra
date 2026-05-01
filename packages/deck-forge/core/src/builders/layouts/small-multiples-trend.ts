import {
  countByType,
  createCardGrid,
  createInsightBand,
  hasChart,
  hasTrendSignals,
  isDataInsightIntent,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Small Multiples / Trend: arranges 2+ charts (or chart + metrics) in a
 * grid with a bottom insight band.  Designed for monthly/quarterly trend
 * slides, comparative chart views, and small-multiples dashboards.
 */
export const smallMultiplesTrendStrategy: LayoutStrategy = {
  id: "small-multiples-trend",
  capability: "small_multiples_trend",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    const chartCount = countByType(ctx.blocks, "chart");
    const metricCount = countByType(ctx.blocks, "metric");
    if (ctx.blocks.length > 10) return false;

    // Multi-chart pattern: 2+ charts
    if (chartCount >= 2 && (isDataInsightIntent(ctx) || hasTrendSignals(ctx))) {
      return true;
    }
    // Chart + metrics trend pattern
    if (chartCount >= 1 && metricCount >= 2 && (isDataInsightIntent(ctx) || hasTrendSignals(ctx))) {
      return true;
    }
    return false;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    const chartBlocks = ctx.blocks.filter((b) => b.type === "chart");
    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const insightBlocks = ctx.blocks.filter(
      (b) => b.type === "callout" || b.type === "paragraph",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "chart" &&
        b.type !== "metric" &&
        b.type !== "callout" &&
        b.type !== "paragraph",
    );

    // Primary visual blocks: charts + metrics
    const primaryBlocks = [...chartBlocks, ...metricBlocks];
    const hasInsight = insightBlocks.length > 0;

    // Resolve template slots via helper
    const cards = resolveSlotFrame(ctx, ["visual", "cards", "metrics"], region);
    const calloutRes = resolveSlotFrame(ctx, ["insight", "callout"], region);

    // Reserve insight band at bottom if there are callouts/paragraphs
    const { main: gridRegion, band: insightBand } = hasInsight
      ? createInsightBand(region, 80)
      : { main: region, band: region };

    const assignments: SubFrameAssignment[] = [];

    // Charts/metrics in responsive grid
    const computedCards = cards.slot ? cards : { ...cards, frame: gridRegion };
    const gridFrames = createCardGrid(computedCards.frame, primaryBlocks.length, density);
    primaryBlocks.forEach((block, i) => {
      const isMetric = block.type === "metric";
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedCards,
          frame: gridFrames[i] ?? gridRegion,
          hints: isMetric
            ? { decoration: "card", alignment: "center", fontScale: 1.1 }
            : undefined,
        }),
      );
    });

    // Insight band
    if (hasInsight) {
      const computedCallout = calloutRes.slot ? calloutRes : { ...calloutRes, frame: insightBand };
      const inFrames = splitVertical(computedCallout.frame, insightBlocks.length, density);
      insightBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: computedCallout,
            frame: inFrames[i] ?? insightBand,
            hints: { role: "callout", decoration: "accent-bar" },
          }),
        );
      });
    }

    // Any remaining blocks
    if (otherBlocks.length > 0) {
      const lastAssignment = assignments[assignments.length - 1];
      const otherTop = lastAssignment
        ? lastAssignment.frame.y + lastAssignment.frame.height + 16
        : region.y;
      const otherRegion = {
        x: region.x,
        y: otherTop,
        width: region.width,
        height: Math.max(60, region.y + region.height - otherTop),
      };
      const otherFrames = splitVertical(otherRegion, otherBlocks.length, density);
      otherBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: otherFrames[i] ?? otherRegion,
        });
      });
    }

    return assignments;
  },
};
