/**
 * Strategy selection trace — diagnostic/observability record.
 */

import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategySelection } from "#src/strategy/strategy-selector.js";

export interface StrategySelectionTrace {
  intentId?: string;
  keyMessage: string;
  audience: string;
  genre: string;
  density: string;
  intent: string;
  contentKinds: string[];
  preferredStrategyId?: string;
  avoidStrategyIds?: string[];
  selection: StrategySelection;
}

/**
 * Builds a trace record from a resolved intent and its selection result.
 */
export function toStrategySelectionTrace(
  intent: ResolvedSlideIntent,
  selection: StrategySelection,
): StrategySelectionTrace {
  return {
    intentId: intent.id,
    keyMessage: intent.keyMessage,
    audience: intent.audience,
    genre: intent.genre,
    density: intent.density,
    intent: intent.intent,
    contentKinds: [...intent.contentKinds],
    preferredStrategyId: intent.preferredStrategyId,
    avoidStrategyIds: intent.avoidStrategyIds,
    selection,
  };
}
