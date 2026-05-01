import { pickGridDimensions, splitGrid, splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * KPI grid: when a slide has 2+ metric blocks, arrange them in a regular
 * grid (2x1 / 2x2 / 3x2 / etc.) spanning the body + visual + callout area.
 * Non-metric blocks fall back to single-stack placement in the remaining
 * space.
 */
export const kpiGridStrategy: LayoutStrategy = {
  id: "kpi-grid",
  capability: "kpi_grid",
  priority: 50,

  match(ctx: LayoutContext): boolean {
    const metricCount = ctx.blocks.filter((block) => block.type === "metric").length;
    return metricCount >= 2;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const metricBlocks = ctx.blocks.filter((block) => block.type === "metric");
    const otherBlocks = ctx.blocks.filter((block) => block.type !== "metric");

    // Combine body + visual + callout into one super-region so metrics can
    // span the full width and full vertical space available.
    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;
    const callout = ctx.regionFrames.callout;

    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, callout.y + callout.height);

    // If there are non-metric blocks, reserve the lower third for them.
    const hasOtherBlocks = otherBlocks.length > 0;
    const metricRegion = {
      x: left,
      y: top,
      width: right - left,
      height: hasOtherBlocks ? Math.round((bottom - top) * 0.65) : bottom - top,
    };
    const otherRegion = {
      x: left,
      y: metricRegion.y + metricRegion.height + 16,
      width: right - left,
      height: bottom - top - metricRegion.height - 16,
    };

    const { cols, rows } = pickGridDimensions(metricBlocks.length);
    const gridFrames = splitGrid(metricRegion, cols, rows, density);

    const assignments: SubFrameAssignment[] = [];
    metricBlocks.forEach((block, index) => {
      const frame = gridFrames[index] ?? metricRegion;
      assignments.push({
        blockId: block.id,
        frame,
        hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
      });
    });

    if (hasOtherBlocks) {
      const otherFrames = splitVertical(otherRegion, otherBlocks.length, density);
      otherBlocks.forEach((block, index) => {
        const frame = otherFrames[index] ?? otherRegion;
        assignments.push({ blockId: block.id, frame });
      });
    }

    return assignments;
  },
};
