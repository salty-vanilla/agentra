import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Diagram focus: a single dominant diagram or image fills most of the
 * body area, with optional caption / paragraph blocks stacked below.
 */
export const diagramFocusStrategy: LayoutStrategy = {
  id: "diagram-focus",
  capability: "diagram_focus",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "diagram_focus";
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
    const focusBlocks = ctx.blocks.filter(
      (block) => block.type === "diagram" || block.type === "image",
    );
    const otherBlocks = ctx.blocks.filter(
      (block) => block.type !== "diagram" && block.type !== "image",
    );

    const hasFocus = focusBlocks.length > 0;
    const hasOthers = otherBlocks.length > 0;

    const focusFrame = hasOthers
      ? {
          x: region.x,
          y: region.y,
          width: region.width,
          height: Math.round(region.height * 0.7),
        }
      : region;
    const captionFrame = hasOthers
      ? {
          x: region.x,
          y: focusFrame.y + focusFrame.height + 16,
          width: region.width,
          height: region.height - focusFrame.height - 16,
        }
      : region;

    const assignments: SubFrameAssignment[] = [];
    if (hasFocus) {
      // First focus block claims the hero frame; extras stack on top of it.
      for (const block of focusBlocks) {
        assignments.push({ blockId: block.id, frame: focusFrame });
      }
    }
    if (hasOthers) {
      const target = hasFocus ? captionFrame : region;
      const frames = splitVertical(target, otherBlocks.length, density);
      otherBlocks.forEach((block, index) => {
        assignments.push({
          blockId: block.id,
          frame: frames[index] ?? target,
          hints: { alignment: "center" as const },
        });
      });
    }
    return assignments;
  },
};
