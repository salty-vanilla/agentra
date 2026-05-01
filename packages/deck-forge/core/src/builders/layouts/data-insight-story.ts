import {
  countByType,
  hasChart,
  hasTable,
  isDataInsightIntent,
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
 * Data Insight Story: a chart or table as the primary visual with a
 * structured insight stack (what / why / action) below.  Designed for
 * data-driven narrative slides that explain a single finding.
 */
export const dataInsightStoryStrategy: LayoutStrategy = {
  id: "data-insight-story",
  capability: "data_insight_story",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (!isDataInsightIntent(ctx)) return false;
    if (!(hasChart(ctx.blocks) || hasTable(ctx.blocks))) return false;
    const calloutCount = countByType(ctx.blocks, "callout");
    const paragraphCount = countByType(ctx.blocks, "paragraph");
    if (calloutCount < 1 && paragraphCount < 2) return false;
    return ctx.blocks.length <= 10;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Separate visual blocks (chart/table) from insight blocks
    const visualBlocks = ctx.blocks.filter(
      (b) => b.type === "chart" || b.type === "table",
    );
    const insightBlocks = ctx.blocks.filter(
      (b) => b.type === "callout" || b.type === "paragraph",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "chart" &&
        b.type !== "table" &&
        b.type !== "callout" &&
        b.type !== "paragraph",
    );

    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots via helper
    const visualRes = resolveSlotFrame(ctx, "visual", region);
    const insightRes = resolveSlotFrame(ctx, ["insight", "callout"], region);

    // Visual area (top ~60%) + insight stack (bottom ~35%)
    const { top: visualRegion, bottom: insightRegion } = splitTopBottom(
      region,
      0.6,
    );

    // Visual blocks in upper region
    const computedVisual = visualRes.slot ? visualRes : { ...visualRes, frame: visualRegion };
    const visualFrames = splitVertical(
      computedVisual.frame,
      visualBlocks.length,
      density,
    );
    visualBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedVisual,
          frame: visualFrames[i] ?? visualRegion,
        }),
      );
    });

    // Insight + other blocks in lower region
    const lowerBlocks = [...insightBlocks, ...otherBlocks];
    const computedInsight = insightRes.slot ? insightRes : { ...insightRes, frame: insightRegion };
    const lowerFrames = splitVertical(
      computedInsight.frame,
      lowerBlocks.length,
      density,
    );
    lowerBlocks.forEach((block, i) => {
      const isFirst = i === 0;
      const isCallout = block.type === "callout";
      const isInsightBlock = isCallout || block.type === "paragraph";
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: isInsightBlock ? computedInsight : { frame: insightRegion, fallbackSlots: [] },
          frame: lowerFrames[i] ?? insightRegion,
          hints:
            isCallout || isFirst
              ? {
                  decoration: "accent-bar",
                  ...(isFirst ? { fontScale: 1.05 } : {}),
                  ...(isCallout ? { role: "callout" as const } : {}),
                }
              : undefined,
        }),
      );
    });

    return assignments;
  },
};
