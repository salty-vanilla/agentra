import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Title slide: large centered title with optional subtitle / footer.  The
 * outer builder still emits the title element from `slideSpec.title`; this
 * strategy handles any non-title content blocks (subtitle, paragraph used
 * as tagline, footer-style caption) by stacking them centered below the
 * title region.
 */
export const titleSlideStrategy: LayoutStrategy = {
  id: "title-slide",
  capability: "title_slide",
  priority: 80,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "title";
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;
    const callout = ctx.regionFrames.callout;

    // Use full slide horizontal extent and the area beneath the title.
    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, callout.y + callout.height);

    const fullArea = { x: left, y: top, width: right - left, height: bottom - top };
    const frames = splitVertical(fullArea, ctx.blocks.length || 1, density);

    return ctx.blocks.map((block, index) => ({
      blockId: block.id,
      frame: frames[index] ?? fullArea,
      hints: { alignment: "center" as const, fontScale: 1.1 },
    }));
  },
};
