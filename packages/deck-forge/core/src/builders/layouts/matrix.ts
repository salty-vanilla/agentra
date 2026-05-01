import { splitGrid } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Matrix: arranges body blocks in a 2x2 grid (the canonical "four
 * quadrants" layout).  Extra blocks beyond four reuse the last quadrant
 * frame (validation surfaces resulting overlap).
 */
export const matrixStrategy: LayoutStrategy = {
  id: "matrix-2x2",
  capability: "matrix",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "matrix";
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
    const cells = splitGrid(region, 2, 2, density);

    return ctx.blocks.map((block, index) => ({
      blockId: block.id,
      frame: cells[Math.min(index, cells.length - 1)] ?? region,
      hints: { decoration: "card" as const, alignment: "center" as const },
    }));
  },
};
