/**
 * DeterministicStrategySelector — picks the best candidate without LLM calls.
 *
 * Selection logic:
 * 1. If preferred candidate exists (reason includes "explicit preferredStrategyId"), pick it.
 * 2. Otherwise pick the first (highest-scored) candidate.
 * 3. If no candidates exist, fallback to "one-message-summary".
 *
 * Confidence:
 * - preferredStrategyId → high
 * - candidate with 3+ reasons → high
 * - candidate with 1-2 reasons → medium
 * - fallback → low
 */

import type {
  StrategySelectionInput,
  StrategySelection,
  StrategySelector,
} from "#src/strategy/strategy-selector.js";

const FALLBACK_STRATEGY_ID = "one-message-summary";

export class DeterministicStrategySelector implements StrategySelector {
  select(input: StrategySelectionInput): StrategySelection {
    const { candidateResult } = input;
    const { candidates, warnings } = candidateResult;
    const candidateIds = candidates.map((c) => c.manifest.id);

    if (candidates.length === 0) {
      return {
        strategyId: FALLBACK_STRATEGY_ID,
        confidence: "low",
        rationale: "No candidates matched; using fallback strategy.",
        selectedBy: "fallback",
        candidateIds,
        warnings: [...warnings],
      };
    }

    // Check for explicit preferredStrategyId
    const preferred = candidates.find((c) =>
      c.reasons.includes("explicit preferredStrategyId"),
    );

    if (preferred) {
      return {
        strategyId: preferred.manifest.id,
        confidence: "high",
        rationale: `Selected by explicit preferredStrategyId: ${preferred.manifest.id}`,
        selectedBy: "preferredStrategyId",
        candidateIds,
        warnings: [...warnings],
      };
    }

    // Pick first (highest scored) candidate
    const top = candidates[0];
    const confidence = top.reasons.length >= 3 ? "high" : "medium";

    return {
      strategyId: top.manifest.id,
      confidence,
      rationale: `Deterministic selection: ${top.reasons.join("; ")}`,
      selectedBy: "deterministicSelector",
      candidateIds,
      warnings: [...warnings],
    };
  }
}
