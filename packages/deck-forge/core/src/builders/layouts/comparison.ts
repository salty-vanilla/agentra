import { splitHorizontal, splitVertical } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { TwoColumnComparisonInput } from "#src/strategy/strategy-input-schemas.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
import type { ContentBlock } from "#src/index.js";

/**
 * Comparison: two-column body layout where left/right columns receive an
 * even share of the slide's body area.  Activates for `comparison`,
 * `image_left_text_right`, and `text_left_image_right` LayoutTypes.
 *
 * Block-to-column assignment:
 *   - For `image_left_text_right` / `text_left_image_right`: images go to
 *     the dictated side, every other block goes to the opposite side.
 *   - For plain `comparison`: blocks are split evenly in arrival order
 *     (first half → left column, second half → right column).
 */
export const twoColumnComparisonStrategy: LayoutStrategy = {
  id: "two-column-comparison",
  capability: "two_column_comparison",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<TwoColumnComparisonInput>({ strategyId: "two-column-comparison", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    return (
      ctx.layoutSpec.type === "comparison" ||
      ctx.layoutSpec.type === "image_left_text_right" ||
      ctx.layoutSpec.type === "text_left_image_right"
    );
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<TwoColumnComparisonInput>({ strategyId: "two-column-comparison", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];

      syntheticBlocks.push({
        id: "si-paragraph-0",
        type: "paragraph",
        text: inp.left.title,
      });
      syntheticBlocks.push({
        id: "si-bullet_list-0",
        type: "bullet_list",
        items: inp.left.points.map((p) => ({ text: p })),
      });
      syntheticBlocks.push({
        id: "si-paragraph-1",
        type: "paragraph",
        text: inp.right.title,
      });
      syntheticBlocks.push({
        id: "si-bullet_list-1",
        type: "bullet_list",
        items: inp.right.points.map((p) => ({ text: p })),
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
    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;

    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, visual.y + visual.height);

    const region = { x: left, y: top, width: right - left, height: bottom - top };
    const [leftCol, rightCol] = splitHorizontal(region, 2, density);
    if (!leftCol || !rightCol) {
      return ctx.blocks.map((block) => ({ blockId: block.id, frame: region }));
    }

    const leftBlocks: typeof ctx.blocks = [];
    const rightBlocks: typeof ctx.blocks = [];

    if (ctx.layoutSpec.type === "image_left_text_right") {
      for (const block of ctx.blocks) {
        if (block.type === "image") leftBlocks.push(block);
        else rightBlocks.push(block);
      }
    } else if (ctx.layoutSpec.type === "text_left_image_right") {
      for (const block of ctx.blocks) {
        if (block.type === "image") rightBlocks.push(block);
        else leftBlocks.push(block);
      }
    } else {
      const half = Math.ceil(ctx.blocks.length / 2);
      ctx.blocks.forEach((block, index) => {
        if (index < half) leftBlocks.push(block);
        else rightBlocks.push(block);
      });
    }

    const leftFrames = splitVertical(leftCol, leftBlocks.length || 1, density);
    const rightFrames = splitVertical(rightCol, rightBlocks.length || 1, density);

    const assignments: SubFrameAssignment[] = [];
    leftBlocks.forEach((block, index) => {
      assignments.push({ blockId: block.id, frame: leftFrames[index] ?? leftCol });
    });
    rightBlocks.forEach((block, index) => {
      assignments.push({ blockId: block.id, frame: rightFrames[index] ?? rightCol });
    });
    return assignments;
}