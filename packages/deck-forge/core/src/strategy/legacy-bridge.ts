/**
 * Legacy bridge: applies a StrategySelection result to a SlideSpec.
 *
 * Writes the selected strategyId back onto the SlideSpec's preferredStrategyId
 * so existing build pipeline picks it up. This is a migration helper until
 * the build pipeline is updated to consume StrategySelection natively.
 */

import type { StrategySelection } from "#src/strategy/strategy-selector.js";

/**
 * Applies a strategy selection to a legacy SlideSpec-like object.
 * Mutates `slideSpec.preferredStrategyId` in place.
 */
export function applyStrategySelectionToLegacySlideSpec(
  slideSpec: { preferredStrategyId?: string },
  selection: StrategySelection,
): void {
  slideSpec.preferredStrategyId = selection.strategyId;
}
