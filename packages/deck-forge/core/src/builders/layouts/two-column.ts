import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Two-column: when a slide has both an image and at least one body block,
 * place body content on the left and the image on the right (or vice versa
 * when `emphasis: "left"`).  Tables/callouts/metrics follow the body
 * column.
 */
export const twoColumnStrategy: LayoutStrategy = {
  id: "two-column",
  capability: "two_column",
  priority: 30,

  match(ctx: LayoutContext): boolean {
    const hasImage = ctx.blocks.some((block) => block.type === "image");
    const hasBody = ctx.blocks.some(
      (block) => block.type === "paragraph" || block.type === "bullet_list",
    );
    return hasImage && hasBody;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const imageOnRight = ctx.layoutSpec.emphasis !== "left";

    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;
    const callout = ctx.regionFrames.callout;

    // Build the unified content rectangle the two columns will share.
    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, visual.y + visual.height);

    const totalWidth = right - left;
    const gap = 24;
    const imageRatio = ctx.layoutSpec.emphasis === "visual" ? 0.55 : 0.45;
    const imageWidth = Math.round((totalWidth - gap) * imageRatio);
    const bodyWidth = totalWidth - gap - imageWidth;

    const imageColumn = {
      x: imageOnRight ? left + bodyWidth + gap : left,
      y: top,
      width: imageWidth,
      height: bottom - top,
    };
    const bodyColumn = {
      x: imageOnRight ? left : left + imageWidth + gap,
      y: top,
      width: bodyWidth,
      height: bottom - top,
    };

    const imageBlocks = ctx.blocks.filter((block) => block.type === "image");
    const otherBlocks = ctx.blocks.filter((block) => block.type !== "image");

    const imageFrames = splitVertical(imageColumn, imageBlocks.length || 1, density);
    const bodyFrames = splitVertical(bodyColumn, otherBlocks.length || 1, density);

    const assignments: SubFrameAssignment[] = [];
    let imageIndex = 0;
    let bodyIndex = 0;

    for (const block of ctx.blocks) {
      if (block.type === "image") {
        const frame = imageFrames[imageIndex] ?? imageColumn;
        assignments.push({ blockId: block.id, frame });
        imageIndex += 1;
        continue;
      }
      const frame = bodyFrames[bodyIndex] ?? bodyColumn;
      const hints =
        block.type === "callout" || block.type === "metric"
          ? { decoration: "accent-bar" as const }
          : undefined;
      assignments.push({ blockId: block.id, frame, hints });
      bodyIndex += 1;
    }

    // Fall back to callout region when the body column has no callouts but
    // a stray callout still needs placement (handled in the loop already).
    void callout;

    return assignments;
  },
};
