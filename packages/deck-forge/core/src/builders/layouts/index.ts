import { comparisonStrategy } from "#src/builders/layouts/comparison.js";
import { dashboardStrategy } from "#src/builders/layouts/dashboard.js";
import { diagramFocusStrategy } from "#src/builders/layouts/diagram-focus.js";
import { heroStrategy } from "#src/builders/layouts/hero.js";
import { kpiGridStrategy } from "#src/builders/layouts/kpi-grid.js";
import { matrixStrategy } from "#src/builders/layouts/matrix.js";
import { sectionDividerStrategy } from "#src/builders/layouts/section-divider.js";
import { singleStackStrategy } from "#src/builders/layouts/single-stack.js";
import { threeColumnStrategy } from "#src/builders/layouts/three-column.js";
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
 *   - 70: explicit body-layout LayoutTypes (comparison, three_column,
 *         matrix, dashboard, timeline, diagram_focus, image_left_text_right,
 *         text_left_image_right).
 *   - 60: hero — content-driven, also matches LayoutSpec.type === "hero".
 *   - 50: kpi-grid — content-driven (metric count >= 2).
 *   - 30: two-column — content-driven (image + body).
 *   - 0:  single-stack fallback.
 */
export const BUILTIN_LAYOUT_STRATEGIES: readonly LayoutStrategy[] = Object.freeze([
  titleSlideStrategy,
  sectionDividerStrategy,
  comparisonStrategy,
  threeColumnStrategy,
  matrixStrategy,
  dashboardStrategy,
  timelineStrategy,
  diagramFocusStrategy,
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
  comparisonStrategy,
  dashboardStrategy,
  diagramFocusStrategy,
  heroStrategy,
  kpiGridStrategy,
  matrixStrategy,
  sectionDividerStrategy,
  singleStackStrategy,
  threeColumnStrategy,
  timelineStrategy,
  titleSlideStrategy,
  twoColumnStrategy,
};
