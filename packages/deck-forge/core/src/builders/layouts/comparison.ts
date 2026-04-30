import { splitHorizontal, splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

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
export const comparisonStrategy: LayoutStrategy = {
  id: "comparison",
  capability: "comparison",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return (
      ctx.layoutSpec.type === "comparison" ||
      ctx.layoutSpec.type === "image_left_text_right" ||
      ctx.layoutSpec.type === "text_left_image_right"
    );
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
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
  },
};
