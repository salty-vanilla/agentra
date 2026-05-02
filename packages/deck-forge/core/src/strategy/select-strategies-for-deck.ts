/**
 * DeckPlan-level strategy selection.
 *
 * Resolves each SlideIntent with deck defaults, then selects a strategy
 * for every slide in the plan.
 */

import type { DeckPlan } from "#src/strategy/deck-plan.js";
import type { StrategyRegistry } from "#src/strategy/registry.js";
import type { StrategySelection, StrategySelector } from "#src/strategy/strategy-selector.js";
import { resolveSlideIntent } from "#src/strategy/slide-intent.js";
import { selectStrategyForIntent } from "#src/strategy/select-strategy-for-intent.js";

export interface DeckStrategySelectionResult {
  selections: StrategySelection[];
  warnings: string[];
}

/**
 * Selects strategies for every slide in a DeckPlan.
 *
 * Uses deck-level audience/genre/density as defaults for each slide intent.
 */
export async function selectStrategiesForDeck(
  deckPlan: DeckPlan,
  registry: StrategyRegistry,
  selector?: StrategySelector,
): Promise<DeckStrategySelectionResult> {
  const deckDefaults = {
    audience: deckPlan.audience,
    genre: deckPlan.genre,
    density: deckPlan.density,
  };

  const warnings: string[] = [];
  const selections: StrategySelection[] = [];

  for (const slideIntent of deckPlan.slides) {
    const resolved = resolveSlideIntent(slideIntent, deckDefaults);
    const selection = await selectStrategyForIntent(resolved, registry, selector);
    selections.push(selection);
    warnings.push(...selection.warnings);
  }

  return { selections, warnings };
}
