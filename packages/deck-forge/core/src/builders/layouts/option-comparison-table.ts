import {
  hasTable,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
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
    if (ctx.slideSpec.intent?.type !== "comparison") return false;
    if (!hasTable(ctx.blocks)) return false;
    return ctx.blocks.length <= 8;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
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
  },
};
