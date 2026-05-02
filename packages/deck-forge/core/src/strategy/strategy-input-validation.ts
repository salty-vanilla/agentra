/**
 * StrategyInput validation — validates a value against the schema
 * registered for a given strategyId.
 */

import type { z } from "zod";
import { STRATEGY_INPUT_SCHEMAS } from "#src/strategy/strategy-input-schemas.js";

export interface StrategyInputValidationResult {
  ok: boolean;
  strategyId: string;
  input?: unknown;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a value against the inputSchema for the given strategyId.
 *
 * - Unknown strategyId → ok: false
 * - No schema registered → ok: false + warning
 * - Schema exists, value passes → ok: true
 * - Schema exists, value fails → ok: false + errors
 */
export function validateStrategyInput(input: {
  strategyId: string;
  value: unknown;
}): StrategyInputValidationResult {
  const schema = STRATEGY_INPUT_SCHEMAS[input.strategyId] as z.ZodType | undefined;

  if (!schema) {
    return {
      ok: false,
      strategyId: input.strategyId,
      errors: [`No input schema registered for strategyId "${input.strategyId}".`],
      warnings: [],
    };
  }

  const result = schema.safeParse(input.value);

  if (result.success) {
    return {
      ok: true,
      strategyId: input.strategyId,
      input: result.data,
      errors: [],
      warnings: [],
    };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );

  return {
    ok: false,
    strategyId: input.strategyId,
    errors,
    warnings: [],
  };
}
