import { STANDARD_KPI_CARD_HEIGHT, pickGridDimensions, splitGrid, splitVertical } from "#src/builders/layouts/grid-utils.js";
import { readStrategyInput } from "#src/builders/layouts/strategy-input-helpers.js";
import type { MetricTileDashboardInput } from "#src/strategy/strategy-input-schemas.js";
import type { ContentBlock } from "#src/index.js";
import type {
  LayoutContext,
  LayoutResult,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * Dashboard: KPI metrics grid in the top half of the body area, with
 * supporting chart / table / paragraph blocks stacked in the lower half.
 * If the slide has no metrics, falls back to placing the chart/table at
 * full body width.
 */
export const metricTileDashboardStrategy: LayoutStrategy = {
  id: "metric-tile-dashboard",
  capability: "metric_tile_dashboard",
  priority: 70,

  match(ctx: LayoutContext): boolean {
    if (ctx.strategyInput != null) {
      const r = readStrategyInput<MetricTileDashboardInput>({ strategyId: "metric-tile-dashboard", strategyInput: ctx.strategyInput });
      if (r.ok) return true;
    }
    return ctx.layoutSpec.type === "dashboard";
  },

  layout(ctx: LayoutContext): LayoutResult {
    const sir = readStrategyInput<MetricTileDashboardInput>({ strategyId: "metric-tile-dashboard", strategyInput: ctx.strategyInput });
    if (sir.ok && sir.input) {
      const inp = sir.input;
      const syntheticBlocks: ContentBlock[] = [];
      for (const [i, tile] of inp.tiles.entries()) {
        syntheticBlocks.push({
          id: `si-metric-${i}`,
          type: "metric",
          label: tile.label,
          value: tile.value,
          unit: tile.unit,
          trend: tile.trend === "unknown" || tile.trend === "mixed" ? undefined : tile.trend,
        });
      }
      if (inp.keyTakeaway) {
        syntheticBlocks.push({ id: "si-callout-0", type: "callout", text: inp.keyTakeaway, tone: "info" });
      }
      const nativeCtx = { ...ctx, blocks: syntheticBlocks };
      const assignments = layoutBlocks(nativeCtx);
      return { assignments, syntheticBlocks, strategyInputMode: "native", strategyInputWarnings: sir.warnings };
    }
    const assignments = layoutBlocks(ctx);
    const mode = sir.mode === "invalid" && ctx.blocks.length > 0 ? "invalid-fallback" as const : sir.mode;
    return { assignments, strategyInputMode: mode, strategyInputWarnings: sir.warnings.length > 0 ? sir.warnings : undefined };
  },
};

function layoutBlocks(ctx: LayoutContext): SubFrameAssignment[] {
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

  const { rows: metricRows } = hasMetrics
    ? pickGridDimensions(metricBlocks.length)
    : { rows: 1 };
  const idealMetricHeight = Math.min(
    STANDARD_KPI_CARD_HEIGHT * metricRows + 16 * (metricRows - 1),
    region.height,
  );
  const metricRegion = hasOthers
    ? {
        x: region.x,
        y: region.y,
        width: region.width,
        height: Math.min(idealMetricHeight, Math.round(region.height * 0.6)),
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
}
