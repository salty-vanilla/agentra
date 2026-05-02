/**
 * Converts Zod StrategyInput schemas to JSON Schema for LLM prompts.
 *
 * This module provides the bridge between runtime validation (Zod) and
 * LLM-facing schema descriptions (JSON Schema). The JSON Schema output
 * preserves required/optional, enum values, array min/max constraints,
 * and property descriptions.
 *
 * Uses Zod 4's native toJSONSchema() for conversion.
 */

import { z } from "zod";
import { STRATEGY_INPUT_SCHEMAS } from "#src/strategy/strategy-input-schemas.js";

/**
 * Returns a JSON-serializable JSON Schema object for the given strategyId.
 *
 * Returns `undefined` if the strategyId is not registered.
 *
 * The returned object is plain JSON — no functions, no Zod internals.
 */
export function getStrategyInputJsonSchema(strategyId: string): unknown | undefined {
	const zodSchema = STRATEGY_INPUT_SCHEMAS[strategyId];
	if (!zodSchema) {
		return undefined;
	}
	return z.toJSONSchema(zodSchema);
}

/**
 * Map of all strategy IDs to their JSON Schema representations.
 * Lazily computed on first access.
 */
let _cachedJsonSchemas: Record<string, unknown> | undefined;

export function getAllStrategyInputJsonSchemas(): Record<string, unknown> {
	if (!_cachedJsonSchemas) {
		_cachedJsonSchemas = {};
		for (const [id, schema] of Object.entries(STRATEGY_INPUT_SCHEMAS)) {
			_cachedJsonSchemas[id] = z.toJSONSchema(schema);
		}
	}
	return _cachedJsonSchemas;
}
