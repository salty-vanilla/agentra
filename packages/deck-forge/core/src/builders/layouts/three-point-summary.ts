import {
  countByType,
  createHorizontalCards,
  createInsightBand,
  hasComplexVisuals,
  hasShortBulletGroup,
  mergeAllRegions,
} from "#src/builders/layouts/business-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { ThreePointSummaryInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

/**
 * Three-Point Summary: exactly 3 key points laid out as horizontal cards.
 * Designed for slides that present 3 pillars, 3 takeaways, or 3 focus
 * areas without complex visuals.
 */
export const threePointSummaryStrategy: LayoutStrategy = {
  id: "three-point-summary",
  capability: "three_point_summary",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<ThreePointSummaryInput>({ strategyId: "three-point-summary", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (hasComplexVisuals(ctx.blocks)) return false;
    if (ctx.blocks.length > 5) return false;

    // Reject if any block type is outside the expected set
    const hasUnexpected = ctx.blocks.some(
      (b) =>
        b.type !== "paragraph" &&
        b.type !== "callout" &&
        b.type !== "metric" &&
        b.type !== "bullet_list",
    );
    if (hasUnexpected) return false;

    // Exactly 3 body blocks (paragraph/callout/metric)
    const bodyCount =
      countByType(ctx.blocks, "paragraph") +
      countByType(ctx.blocks, "callout") +
      countByType(ctx.blocks, "metric");

    if (bodyCount === 3) return true;

    // OR exactly 3 bullet items in a single list
    return hasShortBulletGroup(ctx.blocks, 3);
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<ThreePointSummaryInput>({ strategyId: "three-point-summary", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      inp.points.forEach((pt, i) => {
        syntheticBlocks.push({
          id: `si-paragraph-${i}`,
          type: "paragraph",
          text: pt.title + (pt.description ? `\n${pt.description}` : ""),
        });
      });

      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }
    const assignments = layoutBlocks(ctx);
    return { assignments, strategyInputMode: sir.mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // If we have a bullet_list with 3 items, treat it as the 3 points
    const bulletList = ctx.blocks.find(
      (b) => b.type === "bullet_list" && b.items.length === 3,
    );

    if (bulletList) {
      // Bullet list as 3 cards + optional other blocks as callout band
      const otherBlocks = ctx.blocks.filter((b) => b.id !== bulletList.id);

      if (otherBlocks.length === 0) {
        // Full region for the bullet list
        const cards = createHorizontalCards(region, 1, density);
        return [
          {
            blockId: bulletList.id,
            frame: cards[0] ?? region,
            hints: { decoration: "card", alignment: "center" },
          },
        ];
      }

      const { main: cardRegion, band: calloutBand } = createInsightBand(
        region,
        80,
      );

      const assignments: SubFrameAssignment[] = [
        {
          blockId: bulletList.id,
          frame: cardRegion,
          hints: { decoration: "card", alignment: "center" },
        },
      ];

      const bandCards = createHorizontalCards(
        calloutBand,
        otherBlocks.length,
        density,
      );
      otherBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: bandCards[i] ?? calloutBand,
          hints:
            block.type === "callout"
              ? { role: "callout", decoration: "accent-bar" }
              : undefined,
        });
      });

      return assignments;
    }

    // 3 body blocks as horizontal cards
    const bodyBlocks = ctx.blocks.filter(
      (b) =>
        b.type === "paragraph" || b.type === "callout" || b.type === "metric",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "paragraph" && b.type !== "callout" && b.type !== "metric",
    );

    const assignments: SubFrameAssignment[] = [];

    if (otherBlocks.length === 0) {
      // Just 3 cards
      const cards = createHorizontalCards(region, bodyBlocks.length, density);
      bodyBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: cards[i] ?? region,
          hints: { decoration: "card", alignment: "center" },
        });
      });
      return assignments;
    }

    // 3 cards + callout band
    const { main: cardRegion, band: calloutBand } = createInsightBand(
      region,
      80,
    );

    const cards = createHorizontalCards(cardRegion, bodyBlocks.length, density);
    bodyBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: cards[i] ?? cardRegion,
        hints: { decoration: "card", alignment: "center" },
      });
    });

    const bandCards = createHorizontalCards(
      calloutBand,
      otherBlocks.length,
      density,
    );
    otherBlocks.forEach((block, i) => {
      assignments.push({
        blockId: block.id,
        frame: bandCards[i] ?? calloutBand,
      });
    });

    return assignments;
}