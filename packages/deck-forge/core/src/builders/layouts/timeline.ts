import { splitHorizontal } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Timeline: lays body blocks out horizontally as evenly-spaced events
 * along the body region.  Each event/block gets the same fixed-height
 * card spanning the full body height.
 */
export const timelineStrategy: LayoutStrategy = {
  id: "timeline",
  capability: "timeline",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "timeline";
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
    const count = Math.max(1, ctx.blocks.length);
    const cells = splitHorizontal(region, count, density);

    return ctx.blocks.map((block, index) => ({
      blockId: block.id,
      frame: cells[index] ?? region,
      hints: { decoration: "card" as const, alignment: "center" as const },
    }));
  },
};
