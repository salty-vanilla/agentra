import {
  createHorizontalCards,
  hasDecisionSignals,
  isDecisionIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { createMetricRail, createTwoByTwoCards, splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Decision Request: optimised for the `approval-with-kpi-sidecar` template layout.
 * Uses cta → main → metrics → supporting slot order.
 * Table blocks are placed in `main` (not a dedicated `table` slot) to avoid fallbacks.
 */
export const decisionRequestStrategy: LayoutStrategy = {
  id: "decision-request",
  capability: "decision_request",
  priority: 90,

  match(ctx: LayoutContext): boolean {
    if (ctx.blocks.length < 2) return false;
    if (ctx.blocks.length > 10) return false;
    return hasDecisionSignals(ctx) || isDecisionIntent(ctx);
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Resolve template slots — approval-with-kpi-sidecar provides:
    // cta, main, metrics, supporting, footer, title
    // Note: no `table` slot — table blocks go to `main`.
    const ctaRes = resolveSlotFrame(ctx, ["cta", "callout"], region);
    const mainRes = resolveSlotFrame(ctx, ["main", "body"], region);
    const metricsRes = resolveSlotFrame(ctx, "metrics", region);
    const supportingRes = resolveSlotFrame(ctx, ["supporting", "footer"], region);

    // Block categorisation
    const decisionBlocks = ctx.blocks.filter((b) => b.type === "callout");
    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const allParagraphBlocks = ctx.blocks.filter(
      (b) => b.type === "paragraph" || b.type === "bullet_list",
    );
    // Tables and everything else go to main — no `table` slot in approval-with-kpi-sidecar
    const nonTextMainBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "callout" &&
        b.type !== "metric" &&
        b.type !== "paragraph" &&
        b.type !== "bullet_list",
    );

    // When there are 3+ paragraphs, treat the first ones as initiative/main
    // blocks and the last one as supporting. This prevents cramming all
    // paragraphs into the small supporting slot.
    let mainBlocks: typeof ctx.blocks;
    let supportingBlocks: typeof ctx.blocks;
    if (allParagraphBlocks.length >= 3) {
      mainBlocks = [...nonTextMainBlocks, ...allParagraphBlocks.slice(0, -1)];
      supportingBlocks = allParagraphBlocks.slice(-1);
    } else {
      mainBlocks = nonTextMainBlocks;
      supportingBlocks = allParagraphBlocks;
    }

    const assignments: SubFrameAssignment[] = [];

    // When we have a `cta` slot, place decision callouts there;
    // otherwise fall back to splitting the top 30% of the region.
    const hasCtaSlot = !!ctaRes.slot;
    const hasMetricsSlot = !!metricsRes.slot;
    const hasSupportingSlot = !!supportingRes.slot;

    if (hasCtaSlot) {
      // --- Template-slot-aware layout ---

      // 1) Decision callouts → cta slot (first callout only; extras go to supporting)
      const ctaBlocks = decisionBlocks.length > 0 ? [decisionBlocks[0]!] : [];
      const extraCallouts = decisionBlocks.slice(1);

      if (ctaBlocks.length > 0) {
        ctaBlocks.forEach((block) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: ctaRes,
              frame: ctaRes.frame,
              hints: {
                fontScale: 1.4,
                alignment: "center",
                role: "callout",
                decoration: "accent-bar",
              },
            }),
          );
        });
      }

      // 2) Main content → main slot (3–4 blocks use 2×2 grid)
      if (mainBlocks.length > 0) {
        const frames = mainBlocks.length >= 3
          ? createTwoByTwoCards(mainRes.frame, mainBlocks.length, density)
          : mainBlocks.length === 2
            ? createHorizontalCards(mainRes.frame, mainBlocks.length, density)
            : [mainRes.frame];
        mainBlocks.forEach((block, i) => {
          const isTable = block.type === "table";
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: mainRes,
              frame: frames[i] ?? mainRes.frame,
              hints: isTable ? undefined : { decoration: "card" },
            }),
          );
        });
      }

      // 3) Metric blocks → metrics slot (horizontal rail)
      if (metricBlocks.length > 0) {
        const frames = createMetricRail(metricsRes.frame, metricBlocks.length, {
          minCardHeight: 60,
          maxCardHeight: metricsRes.frame.height,
          gap: 16,
        });
        metricBlocks.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: metricsRes,
              frame: frames[i] ?? metricsRes.frame,
              hints: { decoration: "card", fontScale: 1.2 },
            }),
          );
        });
      }

      // 4) Supporting text + extra callouts → supporting slot
      const allSupportingBlocks = [...supportingBlocks, ...extraCallouts];
      if (allSupportingBlocks.length > 0) {
        const frames = splitVertical(supportingRes.frame, allSupportingBlocks.length, density);
        allSupportingBlocks.forEach((block, i) => {
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: supportingRes,
              frame: frames[i] ?? supportingRes.frame,
            }),
          );
        });
      }

      return assignments;
    }

    // --- Fallback: no template slots available, use geometric split ---

    if (decisionBlocks.length > 0) {
      const hasBottom =
        mainBlocks.length > 0 || metricBlocks.length > 0 || supportingBlocks.length > 0;
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

      const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(region, topRatio);

      const decFrames = splitVertical(decisionRegion, decisionBlocks.length, density);
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

      // Distribute lower region across mainBlocks + metricBlocks + supportingBlocks
      const remaining = [...mainBlocks, ...metricBlocks, ...supportingBlocks];
      if (remaining.length > 0) {
        const frames =
          remaining.length <= 4
            ? createHorizontalCards(lowerRegion, remaining.length, density)
            : splitVertical(lowerRegion, remaining.length, density);
        remaining.forEach((block, i) => {
          const isMetric = block.type === "metric";
          const resolvedMain = hasMetricsSlot && isMetric ? metricsRes : mainRes;
          const resolvedSupport =
            hasSupportingSlot &&
            (block.type === "paragraph" || block.type === "bullet_list")
              ? supportingRes
              : mainRes;
          const resolution =
            isMetric ? resolvedMain : resolvedSupport;
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution,
              frame: frames[i] ?? lowerRegion,
              hints: isMetric ? { decoration: "card", fontScale: 1.2 } : { decoration: "card" },
            }),
          );
        });
      }
    } else {
      // No explicit callout — first block gets decision treatment
      const [first, ...rest] = ctx.blocks;
      if (!first) return assignments;

      const { top: decisionRegion, bottom: lowerRegion } = splitTopBottom(region, 0.3);

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
        const cards = createHorizontalCards(lowerRegion, rest.length, density);
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
