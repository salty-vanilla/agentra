import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Section divider: large left-aligned heading with optional supporting
 * subtitle / caption.  Visually similar to the title slide but typically
 * uses an accent bar treatment.
 */
export const sectionDividerStrategy: LayoutStrategy = {
  id: "section-divider",
  capability: "section_divider",
  priority: 80,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "section";
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

    const fullArea = { x: left, y: top, width: right - left, height: bottom - top };
    const frames = splitVertical(fullArea, ctx.blocks.length || 1, density);

    return ctx.blocks.map((block, index) => ({
      blockId: block.id,
      frame: frames[index] ?? fullArea,
      hints: { alignment: "left" as const, decoration: "accent-bar" as const },
    }));
  },
};
