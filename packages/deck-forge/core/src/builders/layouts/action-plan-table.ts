import {
  createInsightBand,
  hasActionPlanSignals,
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
 * Action Plan Table: generous-height action table with clear columns
 * (action, purpose, owner, due date, status) and a decision/CTA band at
 * the bottom.  Designed for action plans, project follow-ups, and review
 * slides.
 */
export const actionPlanTableStrategy: LayoutStrategy = {
  id: "action-plan-table",
  capability: "action_plan_table",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (!hasActionPlanSignals(ctx)) return false;
    if (!hasTable(ctx.blocks)) return false;
    return ctx.blocks.length <= 8;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    const tableBlocks = ctx.blocks.filter((b) => b.type === "table");
    const calloutBlocks = ctx.blocks.filter(
      (b) => b.type === "callout" || b.type === "paragraph",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) => b.type !== "table" && b.type !== "callout" && b.type !== "paragraph",
    );

    const hasCta = calloutBlocks.length > 0 || otherBlocks.length > 0;

    const assignments: SubFrameAssignment[] = [];

    if (!hasCta) {
      // Table only — full region
      const tableFrames = splitVertical(region, tableBlocks.length, density);
      tableBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: tableFrames[i] ?? region,
        });
      });
      return assignments;
    }

    // Table gets top ~70%, CTA band gets bottom ~25%
    const { main: tableRegion, band: ctaBand } = createInsightBand(
      region,
      Math.round(region.height * 0.25),
    );

    // Table blocks in upper region
    const tableFrames = splitVertical(tableRegion, tableBlocks.length, density);
    tableBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: tableFrames[i] ?? tableRegion,
      });
    });

    // CTA / callout blocks in bottom band
    const ctaBlocks = [...calloutBlocks, ...otherBlocks];
    const ctaFrames = splitVertical(ctaBand, ctaBlocks.length, density);
    ctaBlocks.forEach((block, i) => {
      const isCallout = block.type === "callout";
      assignments.push({
        blockId: block.id,
        frame: ctaFrames[i] ?? ctaBand,
        hints: isCallout
          ? { decoration: "accent-bar", role: "callout", fontScale: 1.1 }
          : undefined,
      });
    });

    return assignments;
  },
};
