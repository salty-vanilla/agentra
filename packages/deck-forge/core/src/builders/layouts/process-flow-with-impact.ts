import {
  countByType,
  createHorizontalCards,
  createInsightBand,
  hasCallout,
  isProcessIntent,
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
 * Process Flow with Impact: large horizontal process flow nodes with an
 * impact metric or callout, plus a takeaway band.  Designed for operational
 * workflows, standard processes, and improvement initiatives.
 */
export const processFlowWithImpactStrategy: LayoutStrategy = {
  id: "process-flow-with-impact",
  capability: "process_flow_with_impact",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (!isProcessIntent(ctx)) return false;
    if (ctx.blocks.length < 3 || ctx.blocks.length > 10) return false;
    return hasCallout(ctx.blocks) || countByType(ctx.blocks, "metric") >= 1;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Separate process-flow blocks from impact/insight blocks
    const flowBlockTypes = new Set([
      "paragraph",
      "bullet_list",
      "diagram",
      "image",
    ]);
    const impactBlockTypes = new Set(["metric", "callout"]);

    const flowBlocks = ctx.blocks.filter((b) => flowBlockTypes.has(b.type));
    const impactBlocks = ctx.blocks.filter((b) => impactBlockTypes.has(b.type));
    const otherBlocks = ctx.blocks.filter(
      (b) => !flowBlockTypes.has(b.type) && !impactBlockTypes.has(b.type),
    );

    const hasImpact = impactBlocks.length > 0;
    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots via helper
    const processRes = resolveSlotFrame(ctx, "process", region);
    const calloutRes = resolveSlotFrame(ctx, "callout", region);

    if (flowBlocks.length === 0) {
      // No flow blocks — just stack everything vertically
      const frames = splitVertical(region, ctx.blocks.length, density);
      ctx.blocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: frames[i] ?? region,
        });
      });
      return assignments;
    }

    // Reserve bottom band for impact/takeaway
    const { main: upperRegion, band: impactBand } = hasImpact
      ? createInsightBand(region, 100)
      : { main: region, band: region };

    // Flow nodes laid out horizontally in the upper area
    const flowCount = Math.min(flowBlocks.length, 7);
    const computedProcess = processRes.slot ? processRes : { ...processRes, frame: upperRegion };
    const flowFrames = createHorizontalCards(computedProcess.frame, flowCount, density);
    flowBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedProcess,
          frame: flowFrames[Math.min(i, flowFrames.length - 1)] ?? upperRegion,
          hints: { decoration: "card" },
        }),
      );
    });

    // Impact/callout blocks in bottom band
    if (hasImpact) {
      const computedCallout = calloutRes.slot ? calloutRes : { ...calloutRes, frame: impactBand };
      const impactFrames = splitVertical(computedCallout.frame, impactBlocks.length, density);
      impactBlocks.forEach((block, i) => {
        const isMetric = block.type === "metric";
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: block.type === "callout" ? computedCallout : { frame: impactBand, fallbackSlots: [] },
            frame: impactFrames[i] ?? impactBand,
            hints: isMetric
              ? { decoration: "card", fontScale: 1.2, alignment: "center" }
              : { role: "callout", decoration: "accent-bar" },
          }),
        );
      });
    }

    // Remaining blocks (tables, charts, etc.) stacked below
    if (otherBlocks.length > 0) {
      const { top: _, bottom: otherRegion } = splitTopBottom(region, 0.85);
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
