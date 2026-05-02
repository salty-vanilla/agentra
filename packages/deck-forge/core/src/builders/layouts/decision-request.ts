import {
  createHorizontalCards,
  hasDecisionSignals,
  isDecisionIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { createApprovalItemFrames, createMetricRail, createTwoByTwoCards, splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

// ---------------------------------------------------------------------------
// Callout classification for decision-request slides
// ---------------------------------------------------------------------------

const CTA_KEYWORDS =
  /(?:承認|お願い|本日|決議|判断|依頼|approval|decision|request|go[\s/]no[\s-]?go)/i;

const SUPPORTING_KEYWORDS =
  /(?:実行開始|進捗報告|補足|next\s*action|owner|担当|実施スケジュール|follow[\s-]*up)/i;

type CalloutRole = "cta" | "approval_item" | "supporting";

function classifyCallout(block: ContentBlock): CalloutRole {
  const text = "text" in block ? (block.text as string) : "";
  if (CTA_KEYWORDS.test(text)) return "cta";
  if (SUPPORTING_KEYWORDS.test(text)) return "supporting";
  // Default: treat as approval item (initiative / measure)
  return "approval_item";
}

/**
 * Decision Request: optimised for the `approval-with-kpi-sidecar` template layout.
 * Uses cta → main → metrics → supporting slot order.
 *
 * Phase 7.7-fix2: Classify callouts into CTA / approval-item / supporting so
 * that multiple approval items go to `main` (grid) instead of `supporting`
 * (small slot that causes overlaps).
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
    const ctaRes = resolveSlotFrame(ctx, ["cta", "callout"], region);
    const mainRes = resolveSlotFrame(ctx, ["main", "body"], region);
    const metricsRes = resolveSlotFrame(ctx, "metrics", region);
    const supportingRes = resolveSlotFrame(ctx, ["supporting", "footer"], region);

    // --- Block classification ---
    const allCallouts = ctx.blocks.filter((b) => b.type === "callout");
    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const allParagraphBlocks = ctx.blocks.filter(
      (b) => b.type === "paragraph" || b.type === "bullet_list",
    );
    const nonTextMainBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "callout" &&
        b.type !== "metric" &&
        b.type !== "paragraph" &&
        b.type !== "bullet_list",
    );

    // Classify callouts into CTA / approval-item / supporting
    const ctaCallouts: typeof allCallouts = [];
    const approvalCallouts: typeof allCallouts = [];
    const supportingCallouts: typeof allCallouts = [];
    for (const block of allCallouts) {
      const role = classifyCallout(block);
      if (role === "cta" && ctaCallouts.length === 0) {
        ctaCallouts.push(block);
      } else if (role === "supporting") {
        supportingCallouts.push(block);
      } else {
        approvalCallouts.push(block);
      }
    }
    // If no CTA callout was detected but we have callouts, promote the first one.
    if (ctaCallouts.length === 0 && approvalCallouts.length > 0) {
      ctaCallouts.push(approvalCallouts.shift()!);
    }

    // Main blocks = approval-item callouts + non-text blocks + paragraphs (except last)
    let mainParagraphs: typeof ctx.blocks;
    let supportingParagraphs: typeof ctx.blocks;
    if (allParagraphBlocks.length >= 3) {
      mainParagraphs = allParagraphBlocks.slice(0, -1);
      supportingParagraphs = allParagraphBlocks.slice(-1);
    } else if (allParagraphBlocks.length >= 1 && approvalCallouts.length > 0) {
      // If there are approval callouts, send paragraphs to supporting
      mainParagraphs = [];
      supportingParagraphs = allParagraphBlocks;
    } else {
      mainParagraphs = [];
      supportingParagraphs = allParagraphBlocks;
    }
    const mainBlocks = [...nonTextMainBlocks, ...approvalCallouts, ...mainParagraphs];
    const supportingBlocks = [...supportingParagraphs, ...supportingCallouts];

    const assignments: SubFrameAssignment[] = [];
    const hasCtaSlot = !!ctaRes.slot;

    if (hasCtaSlot) {
      // --- Template-slot-aware layout ---

      // 1) CTA callout → cta slot
      for (const block of ctaCallouts) {
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
      }

      // 2) Main content (approval items + tables) → main slot
      if (mainBlocks.length > 0) {
        const frames = createApprovalItemFrames(mainRes.frame, mainBlocks.length, density);
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

      // 4) Supporting text → supporting slot
      if (supportingBlocks.length > 0) {
        const frames = splitVertical(supportingRes.frame, supportingBlocks.length, density);
        supportingBlocks.forEach((block, i) => {
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

    // --- Fallback: no template slots, geometric split ---

    const allDecision = [...ctaCallouts, ...approvalCallouts];
    if (allDecision.length > 0) {
      const hasBottom =
        mainBlocks.length > 0 || metricBlocks.length > 0 || supportingBlocks.length > 0;
      const topRatio = hasBottom ? 0.3 : 1.0;

      if (!hasBottom) {
        const frames = splitVertical(region, allDecision.length, density);
        allDecision.forEach((block, i) => {
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

      const decFrames = splitVertical(decisionRegion, allDecision.length, density);
      allDecision.forEach((block, i) => {
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
          assignments.push(
            assignmentFromSlot({
              blockId: block.id,
              resolution: isMetric ? metricsRes : mainRes,
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
