import {
  countByType,
  createHorizontalCards,
  hasComplexVisuals,
  isSummaryIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * One-Message Summary: a single dominant key message with optional
 * supporting cards.  Designed for closing slides, executive takeaways,
 * and proposal conclusions where one message must land.
 */
export const oneMessageSummaryStrategy: LayoutStrategy = {
  id: "one-message-summary",
  capability: "one_message_summary",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    if (!isSummaryIntent(ctx)) return false;
    if (hasComplexVisuals(ctx.blocks)) return false;
    if (ctx.blocks.length > 4) return false;
    if (ctx.blocks.length < 1) return false;

    // Need at least 1 dominant paragraph or callout
    const dominantCount =
      countByType(ctx.blocks, "callout") + countByType(ctx.blocks, "paragraph");
    return dominantCount >= 1;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const region = mergeAllRegions(ctx);

    // Find the dominant block (first callout, or first paragraph)
    const dominantBlock =
      ctx.blocks.find((b) => b.type === "callout") ??
      ctx.blocks.find((b) => b.type === "paragraph");

    const supportBlocks = ctx.blocks.filter((b) => b.id !== dominantBlock?.id);
    const assignments: SubFrameAssignment[] = [];

    if (supportBlocks.length === 0 && dominantBlock) {
      // Single message — full region
      assignments.push({
        blockId: dominantBlock.id,
        frame: region,
        hints: { fontScale: 1.3, alignment: "center", role: "callout" },
      });
      return assignments;
    }

    // Key message (top ~50%) + supporting cards (bottom ~45%)
    const { top: messageRegion, bottom: supportRegion } = splitTopBottom(
      region,
      0.5,
    );

    if (dominantBlock) {
      assignments.push({
        blockId: dominantBlock.id,
        frame: messageRegion,
        hints: { fontScale: 1.3, alignment: "center", role: "callout" },
      });
    }

    if (supportBlocks.length > 0) {
      const cards = createHorizontalCards(
        supportRegion,
        supportBlocks.length,
        density,
      );
      supportBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: cards[i] ?? supportRegion,
          hints: { decoration: "card" },
        });
      });
    }

    return assignments;
  },
};
