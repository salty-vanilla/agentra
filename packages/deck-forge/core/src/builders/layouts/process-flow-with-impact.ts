import {
  countByType,
  createHorizontalCards,
  hasCallout,
  hasProcessSignals,
  isProcessIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { createMetricRail, splitVertical } from "#src/builders/layouts/grid-utils.js";
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
  priority: 85,

  match(ctx: LayoutContext): boolean {
    if (!isProcessIntent(ctx) && !hasProcessSignals(ctx)) return false;
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

    const flowBlocks = ctx.blocks.filter((b) => flowBlockTypes.has(b.type));
    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const calloutBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        !flowBlockTypes.has(b.type) &&
        b.type !== "metric" &&
        b.type !== "callout",
    );

    const assignments: SubFrameAssignment[] = [];

    // Resolve template slots — process-with-impact provides:
    // process (left main), impact (right upper), callout (right lower)
    const processRes = resolveSlotFrame(ctx, "process", region);
    const impactRes = resolveSlotFrame(ctx, "impact", region);
    const calloutRes = resolveSlotFrame(ctx, "callout", region);

    const hasSlots = !!processRes.slot;

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

    if (hasSlots) {
      // --- Slot-aware layout: process left, impact+callout right ---

      // 1) Flow blocks → process slot
      const flowFrames = flowBlocks.length <= 1
        ? [processRes.frame]
        : splitVertical(processRes.frame, flowBlocks.length, density);
      flowBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: processRes,
            frame: flowFrames[i] ?? processRes.frame,
            hints: { decoration: "card" },
          }),
        );
      });

      // 2) Metric blocks → impact slot
      if (metricBlocks.length > 0) {
        const metricFrames = metricBlocks.length <= 2
          ? createMetricRail(impactRes.frame, metricBlocks.length, {
              minCardHeight: 80,
              maxCardHeight: impactRes.frame.height,
              gap: 16,
            })
          : splitVertical(impactRes.frame, metricBlocks.length, density);
        metricBlocks.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: impactRes,
              frame: metricFrames[i] ?? impactRes.frame,
              hints: { decoration: "card", fontScale: 1.2, alignment: "center" },
            }),
          );
        });
      }

      // 3) Callout blocks → callout slot
      if (calloutBlocks.length > 0) {
        const calloutFrames = splitVertical(calloutRes.frame, calloutBlocks.length, density);
        calloutBlocks.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: calloutRes,
              frame: calloutFrames[i] ?? calloutRes.frame,
              hints: { role: "callout", decoration: "accent-bar" },
            }),
          );
        });
      }

      // 4) Remaining blocks stacked below process area
      if (otherBlocks.length > 0) {
        const otherFrames = splitVertical(processRes.frame, otherBlocks.length, density);
        otherBlocks.forEach((block, i) => {
          assignments.push({
            blockId: block.id,
            frame: otherFrames[i] ?? processRes.frame,
          });
        });
      }

      return assignments;
    }

    // --- Fallback: no template slots, use geometric split ---

    const impactBlocks = [...metricBlocks, ...calloutBlocks];
    const hasImpact = impactBlocks.length > 0;

    // Reserve bottom band for impact/takeaway
    const { top: upperRegion, bottom: impactBand } = hasImpact
      ? splitTopBottom(region, 0.65, 16)
      : { top: region, bottom: region };

    // Flow nodes laid out horizontally in the upper area
    const flowCount = Math.min(flowBlocks.length, 7);
    const flowFrames = createHorizontalCards(upperRegion, flowCount, density);
    flowBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: processRes,
          frame: flowFrames[Math.min(i, flowFrames.length - 1)] ?? upperRegion,
          hints: { decoration: "card" },
        }),
      );
    });

    // Impact/callout blocks in bottom band
    if (hasImpact) {
      const impactFrames = splitVertical(impactBand, impactBlocks.length, density);
      impactBlocks.forEach((block, i) => {
        const isMetric = block.type === "metric";
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: block.type === "callout" ? calloutRes : impactRes,
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
