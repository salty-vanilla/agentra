import {
  hasRecommendationSignals,
  hasTable,
  mergeAllRegions,
  splitMainSidebar,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Recommendation Comparison: a comparison area (table or side-by-side)
 * with a prominent recommendation callout sidebar.  Designed for vendor
 * evaluations, option assessments, and recommendation slides.
 */
export const recommendationComparisonStrategy: LayoutStrategy = {
  id: "recommendation-comparison",
  capability: "recommendation_comparison",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (!hasRecommendationSignals(ctx)) return false;
    const isComparison = ctx.slideSpec.intent?.type === "comparison";
    if (!hasTable(ctx.blocks) && !isComparison) return false;
    return ctx.blocks.length <= 10;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Separate recommendation callouts from comparison content
    const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const tableBlocks = ctx.blocks.filter((b) => b.type === "table");
    const otherBlocks = ctx.blocks.filter(
      (b) => b.type !== "callout" && b.type !== "table",
    );

    const assignments: SubFrameAssignment[] = [];

    // Main (65%) for comparison content, sidebar (35%) for recommendation
    const hasCallout = calloutBlocks.length > 0;

    if (!hasCallout) {
      // No callout — all blocks in main area vertically
      const frames = splitVertical(region, ctx.blocks.length, density);
      ctx.blocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: frames[i] ?? region,
        });
      });
      return assignments;
    }

    const { main: comparisonRegion, sidebar: recommendationRegion } =
      splitMainSidebar(region, 0.65);

    // Tables + other blocks in main region
    const mainBlocks = [...tableBlocks, ...otherBlocks];
    const mainFrames = splitVertical(
      comparisonRegion,
      mainBlocks.length,
      density,
    );
    mainBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: mainFrames[i] ?? comparisonRegion,
      });
    });

    // Recommendation callouts in sidebar
    const sidebarFrames = splitVertical(
      recommendationRegion,
      calloutBlocks.length,
      density,
    );
    calloutBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: sidebarFrames[i] ?? recommendationRegion,
        hints: {
          decoration: "accent-bar",
          role: "callout",
          fontScale: 1.1,
        },
      });
    });

    return assignments;
  },
};
