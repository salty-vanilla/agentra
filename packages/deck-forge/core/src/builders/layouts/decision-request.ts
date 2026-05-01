import {
  createHorizontalCards,
  hasDecisionSignals,
  isDecisionIntent,
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
 * Decision Request: a prominent decision/approval callout at the top with
 * supporting rationale cards and an optional deadline/owner info band.
 * Designed for approval requests, go/no-go decisions, and executive asks.
 */
export const decisionRequestStrategy: LayoutStrategy = {
  id: "decision-request",
  capability: "decision_request",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.blocks.length < 2) return false;
    if (ctx.blocks.length > 10) return false;
    return hasDecisionSignals(ctx) || isDecisionIntent(ctx);
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Resolve template slots via helper
    const mainRes = resolveSlotFrame(ctx, ["main", "body"], region);
    const ctaRes = resolveSlotFrame(ctx, ["cta", "callout"], region);
    const tableRes = resolveSlotFrame(ctx, "table", region);

    // Categorise blocks
    const decisionBlocks = ctx.blocks.filter(
      (b) => b.type === "callout",
    );
    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const tableBlocks = ctx.blocks.filter((b) => b.type === "table");
    const bodyBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "callout" &&
        b.type !== "metric" &&
        b.type !== "table",
    );

    const assignments: SubFrameAssignment[] = [];

    // If we have a decision callout, give it the top ~30%
    if (decisionBlocks.length > 0) {
      const hasBottom = bodyBlocks.length > 0 || metricBlocks.length > 0 || tableBlocks.length > 0;
      const topRatio = hasBottom ? 0.3 : 1.0;

      if (!hasBottom) {
        const frames = splitVertical(region, decisionBlocks.length, density);
        decisionBlocks.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: ctaRes,
              frame: frames[i] ?? region,
              hints: {
                fontScale: 1.4,
                alignment: "center",
                role: "callout",
                decoration: "accent-bar",
              },
            }),
          );
        });
        return assignments;
      }

      const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(
        region,
        topRatio,
      );

      // Decision callouts
      const decFrames = splitVertical(
        decisionRegion,
        decisionBlocks.length,
        density,
      );
      decisionBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: ctaRes,
            frame: decFrames[i] ?? decisionRegion,
            hints: {
              fontScale: 1.4,
              alignment: "center",
              role: "callout",
              decoration: "accent-bar",
            },
          }),
        );
      });

      // Table blocks get table slot
      tableBlocks.forEach((block) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: tableRes,
            frame: tableRes.slot ? tableRes.frame : lowerRegion,
          }),
        );
      });

      // Remaining blocks in lower region
      const remaining = [...bodyBlocks, ...metricBlocks];

      if (remaining.length <= 4 && remaining.length > 0) {
        const computedMain = mainRes.slot ? mainRes : { ...mainRes, frame: lowerRegion };
        // Use horizontal cards for small counts
        const cards = createHorizontalCards(
          computedMain.frame,
          remaining.length,
          density,
        );
        remaining.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: computedMain,
              frame: cards[i] ?? lowerRegion,
              hints: { decoration: "card" },
            }),
          );
        });
      } else {
        const lowerFrames = splitVertical(
          lowerRegion,
          remaining.length,
          density,
        );
        remaining.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: mainRes,
              frame: lowerFrames[i] ?? lowerRegion,
              hints:
                block.type === "metric"
                  ? { decoration: "card", fontScale: 1.2 }
                  : undefined,
            }),
          );
        });
      }
    } else {
      // No explicit callout — first block gets decision treatment
      const [first, ...rest] = ctx.blocks;
      if (!first) return assignments;

      const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(
        region,
        0.3,
      );

      assignments.push(
        assignmentFromSlot({
          blockId: first.id,
          resolution: ctaRes,
          frame: decisionRegion,
          hints: {
            fontScale: 1.4,
            alignment: "center",
            role: "callout",
            decoration: "accent-bar",
          },
        }),
      );

      if (rest.length > 0) {
        const cards = createHorizontalCards(
          lowerRegion,
          rest.length,
          density,
        );
        rest.forEach((block, i) => {
          assignments.push({
            blockId: block.id,
            frame: cards[i] ?? lowerRegion,
            hints: { decoration: "card" },
          });
        });
      }
    }

    return assignments;
  },
};
