/**
 * Bridge: attaches StrategyInput to a SlideSpec-like object.
 *
 * Temporary until the build pipeline consumes StrategyInput directly.
 */

import { validateStrategyInput } from "#src/strategy/strategy-input-validation.js";

/**
 * A SlideSpec-like object with StrategyInput attached.
 */
export type StrategyInputAttachedSlideSpec<T extends object = Record<string, unknown>> = T & {
  preferredStrategyId: string;
  strategyInput: unknown;
};

/**
 * Applies a strategy input to a SlideSpec-like object.
 *
 * Sets `preferredStrategyId` and attaches `strategyInput`.
 * Preserves all existing fields.
 *
 * If `validate: true`, validates the input against the schema first
 * and throws if validation fails.
 */
export function applyStrategyInputToSlideSpec<T extends object>(input: {
  slideSpec: T;
  strategyId: string;
  strategyInput: unknown;
  validate?: boolean;
}): StrategyInputAttachedSlideSpec<T> {
  if (input.validate) {
    const result = validateStrategyInput({
      strategyId: input.strategyId,
      value: input.strategyInput,
    });
    if (!result.ok) {
      throw new Error(
        `StrategyInput validation failed for "${input.strategyId}": ${result.errors.join("; ")}`,
      );
    }
  }

  return {
    ...input.slideSpec,
    preferredStrategyId: input.strategyId,
    strategyInput: input.strategyInput,
  };
}
