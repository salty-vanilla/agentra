/**
 * DeckPlan-level strategy selection.
 *
 * Resolves each SlideIntent with deck defaults, then selects a strategy
 * for every slide in the plan. Warnings are prefixed with slide identity.
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
 * Output order matches input slide order. Warnings are prefixed with
 * `[slide N]` or `[slide N: <id>]` for traceability.
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

  for (let i = 0; i < deckPlan.slides.length; i++) {
    const slideIntent = deckPlan.slides[i];
    const resolved = resolveSlideIntent(slideIntent, deckDefaults);
    const selection = await selectStrategyForIntent(resolved, registry, selector);
    selections.push(selection);

    // Prefix warnings with slide identity
    const slideLabel = slideIntent.id
      ? `[slide ${i + 1}: ${slideIntent.id}]`
      : `[slide ${i + 1}]`;

    for (const w of selection.warnings) {
      warnings.push(`${slideLabel} ${w}`);
    }
  }

  return { selections, warnings };
}
