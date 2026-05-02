/**
 * Bridge: attaches StrategyInput to a SlideSpec-like object.
 *
 * Temporary until the build pipeline consumes StrategyInput directly.
 */

/**
 * Applies a strategy input to a SlideSpec-like object.
 *
 * Sets `preferredStrategyId` and attaches `strategyInput`.
 * Preserves all existing fields.
 */
export function applyStrategyInputToSlideSpec<T extends object>(input: {
  slideSpec: T;
  strategyId: string;
  strategyInput: unknown;
}): T & { preferredStrategyId: string; strategyInput: unknown } {
  return {
    ...input.slideSpec,
    preferredStrategyId: input.strategyId,
    strategyInput: input.strategyInput,
  };
}
