import { actionPlanTableStrategy } from "#src/builders/layouts/action-plan-table.js";
import { comparisonStrategy } from "#src/builders/layouts/comparison.js";
import { dashboardStrategy } from "#src/builders/layouts/dashboard.js";
import { dataInsightStoryStrategy } from "#src/builders/layouts/data-insight-story.js";
import { decisionRequestStrategy } from "#src/builders/layouts/decision-request.js";
import { diagramFocusStrategy } from "#src/builders/layouts/diagram-focus.js";
import { executiveSummaryKpiStrategy } from "#src/builders/layouts/executive-summary-kpi.js";
import { heroStrategy } from "#src/builders/layouts/hero.js";
import { implementationRoadmapStrategy } from "#src/builders/layouts/implementation-roadmap.js";
import { kpiDashboardWithInsightStrategy } from "#src/builders/layouts/kpi-dashboard-with-insight.js";
import { kpiGridStrategy } from "#src/builders/layouts/kpi-grid.js";
import { layeredArchitectureStrategy } from "#src/builders/layouts/layered-architecture.js";
import { matrixStrategy } from "#src/builders/layouts/matrix.js";
import { oneMessageSummaryStrategy } from "#src/builders/layouts/one-message-summary.js";
import { optionComparisonTableStrategy } from "#src/builders/layouts/option-comparison-table.js";
import { processFlowWithImpactStrategy } from "#src/builders/layouts/process-flow-with-impact.js";
import { recommendationComparisonStrategy } from "#src/builders/layouts/recommendation-comparison.js";
import { sectionDividerStrategy } from "#src/builders/layouts/section-divider.js";
import { singleStackStrategy } from "#src/builders/layouts/single-stack.js";
import { smallMultiplesTrendStrategy } from "#src/builders/layouts/small-multiples-trend.js";
import { threeColumnStrategy } from "#src/builders/layouts/three-column.js";
import { threePointSummaryStrategy } from "#src/builders/layouts/three-point-summary.js";
import { timelineStrategy } from "#src/builders/layouts/timeline.js";
import { titleSlideStrategy } from "#src/builders/layouts/title-slide.js";
import { twoColumnStrategy } from "#src/builders/layouts/two-column.js";
import type { LayoutContext, LayoutStrategy } from "#src/builders/layouts/types.js";

export type {
  LayoutContext,
  LayoutHints,
  LayoutStrategy,
  SubFrameAssignment,
} from "#src/builders/layouts/types.js";
export {
  gapForDensity,
  splitVertical,
  splitHorizontal,
  splitGrid,
  pickGridDimensions,
  MIN_SUBFRAME_HEIGHT,
} from "#src/builders/layouts/grid-utils.js";

/**
 * Built-in strategies, registered in priority order (highest first).  The
 * fallback `singleStackStrategy` is always last and always matches.
 *
 * Priority tiers:
 *   - 80: explicit slide-type layouts (title, section) — should always win
 *         when their LayoutSpec.type matches.
 *   - 75: business slide pattern strategies — content-driven with
 *         conservative matching.  Override generic layout types when strong
 *         content signals exist (e.g. 3+ metrics + callout beats generic
 *         dashboard).
 *   - 70: explicit body-layout LayoutTypes (comparison, three_column,
 *         matrix, dashboard, timeline, diagram_focus, image_left_text_right,
 *         text_left_image_right).
 *   - 60: hero — content-driven, also matches LayoutSpec.type === "hero".
 *   - 50: kpi-grid — content-driven (metric count >= 2).
 *   - 30: two-column — content-driven (image + body).
 *   - 0:  single-stack fallback.
 */
export const BUILTIN_LAYOUT_STRATEGIES: readonly LayoutStrategy[] = Object.freeze([
  // --- 80: explicit slide-type ---
  titleSlideStrategy,
  sectionDividerStrategy,
  // --- 75: business slide pattern strategies (most specific first) ---
  decisionRequestStrategy,
  recommendationComparisonStrategy,
  actionPlanTableStrategy,
  executiveSummaryKpiStrategy,
  kpiDashboardWithInsightStrategy,
  smallMultiplesTrendStrategy,
  dataInsightStoryStrategy,
  optionComparisonTableStrategy,
  processFlowWithImpactStrategy,
  implementationRoadmapStrategy,
  layeredArchitectureStrategy,
  oneMessageSummaryStrategy,
  threePointSummaryStrategy,
  // --- 70: generic explicit body-layout ---
  comparisonStrategy,
  threeColumnStrategy,
  matrixStrategy,
  dashboardStrategy,
  timelineStrategy,
  diagramFocusStrategy,
  // --- 60–0: content-driven + fallback ---
  heroStrategy,
  kpiGridStrategy,
  twoColumnStrategy,
  singleStackStrategy,
]);

/**
 * Picks the highest-priority strategy whose `match()` returns true for the
 * given layout context.  Falls back to `singleStackStrategy`.
 */
export function selectLayoutStrategy(
  ctx: LayoutContext,
  strategies: readonly LayoutStrategy[] = BUILTIN_LAYOUT_STRATEGIES,
): LayoutStrategy {
  const sorted = [...strategies].sort((a, b) => b.priority - a.priority);
  for (const strategy of sorted) {
    if (strategy.match(ctx)) {
      return strategy;
    }
  }
  return singleStackStrategy;
}

export {
  actionPlanTableStrategy,
  comparisonStrategy,
  dashboardStrategy,
  dataInsightStoryStrategy,
  decisionRequestStrategy,
  diagramFocusStrategy,
  executiveSummaryKpiStrategy,
  heroStrategy,
  implementationRoadmapStrategy,
  kpiDashboardWithInsightStrategy,
  kpiGridStrategy,
  layeredArchitectureStrategy,
  matrixStrategy,
  oneMessageSummaryStrategy,
  optionComparisonTableStrategy,
  processFlowWithImpactStrategy,
  recommendationComparisonStrategy,
  sectionDividerStrategy,
  singleStackStrategy,
  smallMultiplesTrendStrategy,
  threeColumnStrategy,
  threePointSummaryStrategy,
  timelineStrategy,
  titleSlideStrategy,
  twoColumnStrategy,
};
