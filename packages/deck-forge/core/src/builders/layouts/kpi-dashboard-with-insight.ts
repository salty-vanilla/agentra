import {
  countByType,
  createCardGrid,
  createInsightBand,
  hasCallout,
  hasChart,
  hasDiagram,
  splitMainSidebar,
} from "#src/builders/layouts/business-utils.js";
import { splitVertical } from "#src/builders/layouts/grid-utils.js";
import { assignmentFromSlot, resolveSlotFrame } from "#src/builders/layouts/slot-utils.js";
import type {
  LayoutContext,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";

/**
 * KPI Dashboard with Insight: KPI metric cards on the left, chart/diagram
 * on the right, and an insight callout band at the bottom.  Designed for
 * dashboard slides that combine quantitative metrics with visual breakdowns.
 */
export const kpiDashboardWithInsightStrategy: LayoutStrategy = {
  id: "kpi-dashboard-with-insight",
  capability: "kpi_dashboard_with_insight",
  priority: 75,

  match(ctx: LayoutContext): boolean {
    const metricCount = countByType(ctx.blocks, "metric");
    if (metricCount < 2) return false;
    if (!(hasChart(ctx.blocks) || hasDiagram(ctx.blocks))) return false;
    if (!(hasCallout(ctx.blocks) || countByType(ctx.blocks, "paragraph") >= 1))
      return false;
    return ctx.blocks.length <= 12;
  },

  layout(ctx: LayoutContext): SubFrameAssignment[] {
    const density = ctx.layoutSpec.density;
    const body = ctx.regionFrames.body;
    const visual = ctx.regionFrames.visual;
    const callout = ctx.regionFrames.callout;

    // Merge body + visual + callout into one super-region
    const left = Math.min(body.x, visual.x);
    const right = Math.max(body.x + body.width, visual.x + visual.width);
    const top = Math.min(body.y, visual.y);
    const bottom = Math.max(body.y + body.height, callout.y + callout.height);
    const fullRegion = { x: left, y: top, width: right - left, height: bottom - top };

    const metricBlocks = ctx.blocks.filter((b) => b.type === "metric");
    const chartBlocks = ctx.blocks.filter(
      (b) => b.type === "chart" || b.type === "diagram",
    );
    const insightBlocks = ctx.blocks.filter(
      (b) => b.type === "callout" || b.type === "paragraph",
    );
    const otherBlocks = ctx.blocks.filter(
      (b) =>
        b.type !== "metric" &&
        b.type !== "chart" &&
        b.type !== "diagram" &&
        b.type !== "callout" &&
        b.type !== "paragraph",
    );

    // Resolve template slots via helper
    const metrics = resolveSlotFrame(ctx, ["metrics", "cards"], fullRegion);
    const visualRes = resolveSlotFrame(ctx, "visual", fullRegion);
    const insight = resolveSlotFrame(ctx, ["insight", "callout"], fullRegion);

    // Reserve insight band at bottom
    const hasInsight = insightBlocks.length > 0;
    const { main: upperRegion, band: insightBand } = hasInsight
      ? createInsightBand(fullRegion, 80)
      : { main: fullRegion, band: fullRegion };

    // Split upper region: left = KPI cards, right = chart/diagram
    const { main: kpiRegion, sidebar: chartRegion } = splitMainSidebar(
      upperRegion,
      0.45,
    );

    const assignments: SubFrameAssignment[] = [];

    // KPI cards — use metrics slot or computed kpiRegion
    const computedMetrics = metrics.slot ? metrics : { ...metrics, frame: kpiRegion };
    const kpiFrames = createCardGrid(computedMetrics.frame, metricBlocks.length, density);
    metricBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedMetrics,
          frame: kpiFrames[i] ?? kpiRegion,
          hints: { decoration: "card", alignment: "center", fontScale: 1.1 },
        }),
      );
    });

    // Chart/diagram — use visual slot or computed chartRegion
    const computedVisual = visualRes.slot ? visualRes : { ...visualRes, frame: chartRegion };
    const chartFrames = splitVertical(computedVisual.frame, chartBlocks.length, density);
    chartBlocks.forEach((block, i) => {
      assignments.push(
        assignmentFromSlot({
          blockId: block.id,
          resolution: computedVisual,
          frame: chartFrames[i] ?? chartRegion,
        }),
      );
    });

    // Insight band — use insight/callout slot or computed band
    if (hasInsight) {
      const computedInsight = insight.slot ? insight : { ...insight, frame: insightBand };
      const inFrames = splitVertical(computedInsight.frame, insightBlocks.length, density);
      insightBlocks.forEach((block, i) => {
        assignments.push(
          assignmentFromSlot({
            blockId: block.id,
            resolution: computedInsight,
            frame: inFrames[i] ?? insightBand,
            hints: { role: "callout", decoration: "accent-bar" },
          }),
        );
      });
    }

    if (otherBlocks.length > 0) {
      const lastAssignment = assignments[assignments.length - 1];
      const otherTop = lastAssignment
        ? lastAssignment.frame.y + lastAssignment.frame.height + 16
        : fullRegion.y;
      const otherRegion = {
        x: fullRegion.x,
        y: otherTop,
        width: fullRegion.width,
        height: Math.max(60, fullRegion.y + fullRegion.height - otherTop),
      };
      const otherFrames = splitVertical(otherRegion, otherBlocks.length, density);
      otherBlocks.forEach((block, i) => {
        assignments.push({
          blockId: block.id,
          frame: otherFrames[i] ?? otherRegion,
        });
      });
    }

    return assignments;
  },
};
