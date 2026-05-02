/**
 * Applies a StrategySelection result to a SlideSpec.
 *
 * Writes the selected strategyId back onto the SlideSpec's preferredStrategyId
 * so the existing build pipeline picks it up. This is a bridge until
 * the build pipeline consumes StrategySelection natively.
 */

import type { StrategySelection } from "#src/strategy/strategy-selector.js";

/**
 * Applies a strategy selection to a SlideSpec-like object.
 * Mutates `slideSpec.preferredStrategyId` in place.
 */
export function applyStrategySelectionToSlideSpec(
  slideSpec: { preferredStrategyId?: string },
  selection: StrategySelection,
): void {
  slideSpec.preferredStrategyId = selection.strategyId;
}
