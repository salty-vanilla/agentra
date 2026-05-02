import {
  createInsightBand,
  hasActionPlanSignals,
  hasTable,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { ActionPlanTableInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

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
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<ActionPlanTableInput>({ strategyId: "action-plan-table", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (!hasActionPlanSignals(ctx)) return false;
    if (!hasTable(ctx.blocks)) return false;
    return ctx.blocks.length <= 8;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<ActionPlanTableInput>({ strategyId: "action-plan-table", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      syntheticBlocks.push({
        id: "si-table-0",
        type: "table",
        headers: ["Action", "Owner", "Due Date", "Status"],
        rows: inp.actions.map((a) => [a.action, a.owner ?? "", a.dueDate ?? "", a.status ?? ""]),
      });

      if (inp.keyTakeaway) {
        syntheticBlocks.push({
          id: "si-callout-0",
          type: "callout",
          text: inp.keyTakeaway,
          tone: "info",
        });
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
}