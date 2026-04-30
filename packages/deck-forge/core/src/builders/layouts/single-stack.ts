import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Fallback layout: every body / table / image / callout / metric block is
 * stacked vertically inside its native region.  Reproduces the original
 * `splitVertical`-only behaviour from before 0.3.0 so existing slides keep
 * the same layout when no other strategy matches.
 */
export const singleStackStrategy: LayoutStrategy = {
  id: "single-stack",
  capability: "single_stack",
  priority: 0,

  match(): boolean {
    return true;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const bodyBlocks = ctx.blocks.filter(
      (block) => block.type === "paragraph" || block.type === "bullet_list",
    );
    const tableBlocks = ctx.blocks.filter((block) => block.type === "table");
    const imageBlocks = ctx.blocks.filter((block) => block.type === "image");
    const calloutBlocks = ctx.blocks.filter(
      (block) => block.type === "callout" || block.type === "metric",
    );

    const bodyFrames = splitVertical(ctx.regionFrames.body, bodyBlocks.length || 1, density);
    const tableFrames = splitVertical(ctx.regionFrames.table, tableBlocks.length || 1, density);
    const imageFrames = splitVertical(ctx.regionFrames.visual, imageBlocks.length || 1, density);
    const calloutFrames = splitVertical(
      ctx.regionFrames.callout,
      calloutBlocks.length || 1,
      density,
    );

    const assignments: SubFrameAssignment[] = [];
    let bodyIndex = 0;
    let tableIndex = 0;
    let imageIndex = 0;
    let calloutIndex = 0;

    for (const block of ctx.blocks) {
      if (block.type === "paragraph" || block.type === "bullet_list") {
        const frame = bodyFrames[bodyIndex] ?? ctx.regionFrames.body;
        assignments.push({ blockId: block.id, frame });
        bodyIndex += 1;
        continue;
      }
      if (block.type === "table") {
        const frame = tableFrames[tableIndex] ?? ctx.regionFrames.table;
        assignments.push({ blockId: block.id, frame });
        tableIndex += 1;
        continue;
      }
      if (block.type === "image") {
        const frame = imageFrames[imageIndex] ?? ctx.regionFrames.visual;
        assignments.push({ blockId: block.id, frame });
        imageIndex += 1;
        continue;
      }
      if (block.type === "callout" || block.type === "metric") {
        const frame = calloutFrames[calloutIndex] ?? ctx.regionFrames.callout;
        assignments.push({ blockId: block.id, frame });
        calloutIndex += 1;
      }
    }

    return assignments;
  },
};
