import { splitHorizontal, splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Three-column: divides the body area into three equal vertical columns
 * and distributes blocks round-robin across columns in arrival order.
 */
export const threeColumnStrategy: LayoutStrategy = {
  id: "three-column",
  capability: "three_column",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "three_column";
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;
    const callout = ctx.regionFrames.callout;

    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, callout.y + callout.height);

    const region = { x: left, y: top, width: right - left, height: bottom - top };
    const cols = splitHorizontal(region, 3, density);

    const buckets: (typeof ctx.blocks)[] = [[], [], []];
    ctx.blocks.forEach((block, index) => {
      const target = buckets[index % 3];
      if (target) target.push(block);
    });

    const assignments: SubFrameAssignment[] = [];
    buckets.forEach((bucket, colIndex) => {
      const col = cols[colIndex] ?? region;
      const frames = splitVertical(col, bucket.length || 1, density);
      bucket.forEach((block, rowIndex) => {
        assignments.push({ blockId: block.id, frame: frames[rowIndex] ?? col });
      });
    });
    return assignments;
  },
};
