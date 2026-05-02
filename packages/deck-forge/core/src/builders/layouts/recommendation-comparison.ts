import {
  hasRecommendationSignals,
  hasTable,
  mergeAllRegions,
  splitMainSidebar,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { RecommendationComparisonInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
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
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<RecommendationComparisonInput>({ strategyId: "recommendation-comparison", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (!hasRecommendationSignals(ctx)) return false;
    const isComparison = ctx.slideSpec.intent?.type === "comparison";
    if (!hasTable(ctx.blocks) && !isComparison) return false;
    return ctx.blocks.length <= 10;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<RecommendationComparisonInput>({ strategyId: "recommendation-comparison", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      const headers = ["Option", "Pros", "Cons", "Score"];
      const rows = inp.options.map((opt) => [
        opt.label,
        (opt.pros ?? []).join(", "),
        (opt.cons ?? []).join(", "),
        opt.score ?? "",
      ]);
      syntheticBlocks.push({ id: "si-table-0", type: "table", headers, rows });
      syntheticBlocks.push({ id: "si-callout-0", type: "callout", text: inp.recommendation, tone: "success" });
      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }
    const assignments = layoutBlocks(ctx);
    const mode = sir.mode === "invalid" && ctx.blocks.length > 0 ? "invalid-fallback" as const : sir.mode;
    return { assignments, strategyInputMode: mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
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
}
