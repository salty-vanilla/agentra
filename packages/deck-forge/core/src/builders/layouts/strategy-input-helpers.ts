/**
 * Helpers for reading and validating StrategyInput inside layout strategies.
 *
 * Provides a type-safe way to extract validated StrategyInput from a
 * LayoutContext, returning warnings instead of throwing on invalid input.
 */

import { validateStrategyInput } from "#src/strategy/strategy-input-validation.js";

export interface StrategyInputReadResult<T> {
	ok: boolean;
	input?: T;
	mode: "native" | "legacy-fallback" | "invalid" | "missing";
	warnings: string[];
}

/**
 * Reads and validates strategyInput for a given strategyId.
 *
 * - If no strategyInput: ok=false, mode="missing"
 * - If strategyId unknown: ok=false, mode="invalid"
 * - If validation fails: ok=false, mode="invalid", with error messages
 * - If valid: ok=true, mode="native", with parsed input
 */
export function readStrategyInput<T>(input: {
	strategyId: string;
	strategyInput: unknown;
}): StrategyInputReadResult<T> {
	if (input.strategyInput == null) {
		return {
			ok: false,
			mode: "missing",
			warnings: [`No strategyInput provided for "${input.strategyId}".`],
		};
	}

	const result = validateStrategyInput({
		strategyId: input.strategyId,
		value: input.strategyInput,
	});

	if (!result.ok) {
		return {
			ok: false,
			mode: "invalid",
			warnings: result.errors,
		};
	}

	return {
		ok: true,
		input: result.input as T,
		mode: "native",
		warnings: [],
	};
}
