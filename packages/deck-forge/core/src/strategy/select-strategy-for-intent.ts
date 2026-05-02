/**
 * Convenience function: combines candidate finding + strategy selection in one call.
 *
 * After selection, validates the fallback strategy ID against the registry
 * and adds a warning if it is not registered.
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
 * Validates fallback selections against the registry.
 */
export async function selectStrategyForIntent(
  intent: ResolvedSlideIntent,
  registry: StrategyRegistry,
  selector?: StrategySelector,
): Promise<StrategySelection> {
  const candidateResult = findStrategyCandidatesForIntent(intent, registry);
  const effectiveSelector = selector ?? new DeterministicStrategySelector();
  const selection = await effectiveSelector.select({ intent, candidateResult });

  // Validate fallback strategy exists in registry
  if (selection.selectedBy === "fallback") {
    const manifest = registry.getStrategyManifest(selection.strategyId);
    if (!manifest) {
      selection.warnings.push(
        `Fallback strategyId "${selection.strategyId}" is not registered.`,
      );
    }
  }

  return selection;
}
