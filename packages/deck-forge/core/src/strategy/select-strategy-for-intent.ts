/**
 * Convenience function: combines candidate finding + strategy selection in one call.
 */

import type { StrategyRegistry } from "#src/strategy/registry.js";
import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategySelection, StrategySelector } from "#src/strategy/strategy-selector.js";
import { findStrategyCandidatesForIntent } from "#src/strategy/intent-to-strategy.js";
import { DeterministicStrategySelector } from "#src/strategy/deterministic-strategy-selector.js";

/**
 * Selects a strategy for a single resolved slide intent.
 *
 * If no selector is provided, uses DeterministicStrategySelector.
 */
export async function selectStrategyForIntent(
  intent: ResolvedSlideIntent,
  registry: StrategyRegistry,
  selector?: StrategySelector,
): Promise<StrategySelection> {
  const candidateResult = findStrategyCandidatesForIntent(intent, registry);
  const effectiveSelector = selector ?? new DeterministicStrategySelector();
  return effectiveSelector.select({ intent, candidateResult });
}
