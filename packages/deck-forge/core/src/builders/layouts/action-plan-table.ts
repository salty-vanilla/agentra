import {
  createInsightBand,
  hasActionPlanSignals,
  hasTable,
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

    // Resolve template slots via helper
    const tableRes = resolveSlotFrame(ctx, "table", region);
    const ctaRes = resolveSlotFrame(ctx, ["cta", "callout"], region);

    if (!hasCta) {
      const computedTable = tableRes.slot ? tableRes : { ...tableRes, frame: region };
      const tableFrames = splitVertical(computedTable.frame, tableBlocks.length, density);
      tableBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: computedTable,
            frame: tableFrames[i] ?? region,
          }),
        );
      });
      return assignments;
    }

    // Table gets top ~70%, CTA band gets bottom ~25%
    const { main: tableRegion, band: ctaBand } = createInsightBand(
      region,
      Math.round(region.height * 0.25),
    );

    const computedTable = tableRes.slot ? tableRes : { ...tableRes, frame: tableRegion };
    const tableFrames = splitVertical(computedTable.frame, tableBlocks.length, density);
    tableBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedTable,
          frame: tableFrames[i] ?? tableRegion,
        }),
      );
    });

    // CTA / callout blocks in bottom band
    const ctaBlocks = [...calloutBlocks, ...otherBlocks];
    const computedCta = ctaRes.slot ? ctaRes : { ...ctaRes, frame: ctaBand };
    const ctaFrames = splitVertical(computedCta.frame, ctaBlocks.length, density);
    ctaBlocks.forEach((block, i) => {
      const isCallout = block.type === "callout";
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedCta,
          frame: ctaFrames[i] ?? ctaBand,
          hints: isCallout
            ? { decoration: "accent-bar", role: "callout", fontScale: 1.1 }
            : undefined,
        }),
      );
    });

    return assignments;
  },
};
