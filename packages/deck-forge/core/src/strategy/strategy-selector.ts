/**
 * Strategy Selector — interface and types for selecting the final strategyId
 * from a set of candidates produced by findStrategyCandidatesForIntent().
 */

import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategyCandidateResult } from "#src/strategy/intent-to-strategy.js";

export interface StrategySelectionInput {
  intent: ResolvedSlideIntent;
  candidateResult: StrategyCandidateResult;
}

export interface StrategySelection {
  strategyId: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
  selectedBy: "preferredStrategyId" | "deterministicSelector" | "llmSelector" | "fallback";
  candidateIds: string[];
  warnings: string[];
}

export interface StrategySelector {
  select(input: StrategySelectionInput): Promise<StrategySelection> | StrategySelection;
}
