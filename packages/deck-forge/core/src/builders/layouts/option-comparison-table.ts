import {
  hasTable,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { OptionComparisonTableInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Option Comparison Table: a full-width table covering most of the slide
 * with a summary band at the bottom.  Designed for side-by-side option
 * comparison slides with a comparison intent.
 */
export const optionComparisonTableStrategy: LayoutStrategy = {
  id: "option-comparison-table",
  capability: "option_comparison_table",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<OptionComparisonTableInput>({ strategyId: "option-comparison-table", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (ctx.slideSpec.intent?.type !== "comparison") return false;
    if (!hasTable(ctx.blocks)) return false;
    return ctx.blocks.length <= 8;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<OptionComparisonTableInput>({ strategyId: "option-comparison-table", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      const headers = ["Option", ...inp.criteria];
      const rows = inp.options.map((opt) => {
        const cells = [opt.label];
        for (const _criterion of inp.criteria) {
          // Use pros/summary as best available data for each criterion
          const cellText = opt.pros?.join(", ") ?? opt.summary ?? "";
          cells.push(cellText);
        }
        return cells;
      });
      syntheticBlocks.push({ id: "si-table-0", type: "table", headers, rows });
      if (inp.recommendation) {
        syntheticBlocks.push({ id: "si-callout-0", type: "callout", text: inp.recommendation, tone: "success" });
      }
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

  const tableBlocks = ctx.blocks.filter((b) => b.type === "table");
  const summaryBlocks = ctx.blocks.filter((b) => b.type !== "table");

  const assignments: SubFrameAssignment[] = [];

  if (summaryBlocks.length === 0) {
    // Table only — full region
    const frames = splitVertical(region, tableBlocks.length, density);
    tableBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: frames[i] ?? region,
      });
    });
    return assignments;
  }

  // Table gets top ~70%, summary band gets bottom ~25%
  const tableHeight = Math.round(region.height * 0.7);
  const gap = 16;
  const tableRegion = {
    x: region.x,
    y: region.y,
    width: region.width,
    height: tableHeight,
  };
  const summaryRegion = {
    x: region.x,
    y: region.y + tableHeight + gap,
    width: region.width,
    height: region.height - tableHeight - gap,
  };

  // Table blocks in upper region
  const tableFrames = splitVertical(tableRegion, tableBlocks.length, density);
  tableBlocks.forEach((block, i) => {
    assignments.push({
      blockId: block.id,
      frame: tableFrames[i] ?? tableRegion,
    });
  });

  // Summary blocks in lower region
  const summaryFrames = splitVertical(
    summaryRegion,
    summaryBlocks.length,
    density,
  );
  summaryBlocks.forEach((block, i) => {
    const isCallout = block.type === "callout";
    assignments.push({
      blockId: block.id,
      frame: summaryFrames[i] ?? summaryRegion,
      hints: {
        decoration: "card",
        role: "callout",
        ...(isCallout ? { fontScale: 1.05 } : {}),
      },
    });
  });

  return assignments;
}
