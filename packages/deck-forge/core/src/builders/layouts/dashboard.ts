import { pickGridDimensions, splitGrid, splitVertical } from "#src/builders/layouts/grid-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Dashboard: KPI metrics grid in the top half of the body area, with
 * supporting chart / table / paragraph blocks stacked in the lower half.
 * If the slide has no metrics, falls back to placing the chart/table at
 * full body width.
 */
export const dashboardStrategy: LayoutStrategy = {
  id: "dashboard",
  capability: "dashboard",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    return ctx.layoutSpec.type === "dashboard";
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
    const metricBlocks = ctx.blocks.filter((block) => block.type === "metric");
    const otherBlocks = ctx.blocks.filter((block) => block.type !== "metric");

    const hasMetrics = metricBlocks.length > 0;
    const hasOthers = otherBlocks.length > 0;

    const metricRegion = hasOthers
      ? {
          x: region.x,
          y: region.y,
          width: region.width,
          height: Math.round(region.height * 0.45),
        }
      : region;
    const lowerRegion = hasOthers
      ? {
          x: region.x,
          y: metricRegion.y + metricRegion.height + 16,
          width: region.width,
          height: region.height - metricRegion.height - 16,
        }
      : region;

    const assignments: SubFrameAssignment[] = [];

    if (hasMetrics) {
      const { cols, rows } = pickGridDimensions(metricBlocks.length);
      const cells = splitGrid(metricRegion, cols, rows, density);
      metricBlocks.forEach((block, index) => {
        assignments.push({
          blockId: block.id,
          frame: cells[index] ?? metricRegion,
          hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
        });
      });
    }

    if (hasOthers) {
      const target = hasMetrics ? lowerRegion : region;
      const frames = splitVertical(target, otherBlocks.length, density);
      otherBlocks.forEach((block, index) => {
        assignments.push({ blockId: block.id, frame: frames[index] ?? target });
      });
    }

    return assignments;
  },
};
