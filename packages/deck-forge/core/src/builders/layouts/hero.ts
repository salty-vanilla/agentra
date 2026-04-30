import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Hero: a single dominant image fills most of the slide and any caption /
 * paragraph / callout content overlays the bottom strip.  Activates when
 * the layout type is `"hero"` or when the slide has exactly one image and
 * a small amount of text.
 */
export const heroStrategy: LayoutStrategy = {
  id: "hero",
  capability: "hero_visual",
  priority: 60,

  match(ctx: LayoutContext): boolean {
    if (ctx.layoutSpec.type === "hero") {
      const hasImage = ctx.blocks.some((block) => block.type === "image");
      return hasImage;
    }
    const imageCount = ctx.blocks.filter((block) => block.type === "image").length;
    const textCount = ctx.blocks.filter(
      (block) => block.type === "paragraph" || block.type === "bullet_list",
    ).length;
    return imageCount === 1 && textCount <= 2;
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

    const heroFrame = {
      x: left,
      y: top,
      width: right - left,
      height: Math.round((bottom - top) * 0.75),
    };
    const captionFrame = {
      x: left,
      y: heroFrame.y + heroFrame.height + 16,
      width: right - left,
      height: bottom - top - heroFrame.height - 16,
    };

    const imageBlocks = ctx.blocks.filter((block) => block.type === "image");
    const otherBlocks = ctx.blocks.filter((block) => block.type !== "image");

    const assignments: SubFrameAssignment[] = [];
    // First image takes the hero spot; additional images stack inside it
    // (rare, but handle gracefully).
    if (imageBlocks.length > 0) {
      const firstImage = imageBlocks[0];
      if (firstImage) {
        assignments.push({ blockId: firstImage.id, frame: heroFrame });
      }
      for (let index = 1; index < imageBlocks.length; index += 1) {
        const imageBlock = imageBlocks[index];
        if (imageBlock) {
          assignments.push({ blockId: imageBlock.id, frame: heroFrame });
        }
      }
    }

    if (otherBlocks.length > 0) {
      const captionFrames = splitVertical(captionFrame, otherBlocks.length, density);
      otherBlocks.forEach((block, index) => {
        const frame = captionFrames[index] ?? captionFrame;
        assignments.push({
          blockId: block.id,
          frame,
          hints: { alignment: "center", fontScale: 1.05 },
        });
      });
    }

    return assignments;
  },
};
