import {
  countByType,
  createHorizontalCards,
  hasComplexVisuals,
  isSummaryIntent,
  mergeAllRegions,
  splitTopBottom,
} from "#src/builders/layouts/business-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { OneMessageSummaryInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

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
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<OneMessageSummaryInput>({ strategyId: "one-message-summary", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    if (!isSummaryIntent(ctx)) return false;
    if (hasComplexVisuals(ctx.blocks)) return false;
    if (ctx.blocks.length > 4) return false;
    if (ctx.blocks.length < 1) return false;

    // Need at least 1 dominant paragraph or callout
    const dominantCount =
      countByType(ctx.blocks, "callout") + countByType(ctx.blocks, "paragraph");
    return dominantCount >= 1;
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<OneMessageSummaryInput>({ strategyId: "one-message-summary", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      syntheticBlocks.push({
        id: "si-callout-0",
        type: "callout",
        text: inp.message,
        tone: "info",
      });

      if (inp.supportingText) {
        syntheticBlocks.push({
          id: "si-paragraph-0",
          type: "paragraph",
          text: inp.supportingText,
        });
      }

      if (inp.callout) {
        syntheticBlocks.push({
          id: "si-callout-1",
          type: "callout",
          text: inp.callout,
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
}