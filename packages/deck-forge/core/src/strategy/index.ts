/**
 * Strategy module barrel export.
 *
 * Re-exports types, manifest interface, registry, built-in manifests,
 * SlideIntent, DeckPlan, candidate selection, and prompt helpers.
 */

export type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";

export type { StrategyManifest, StrategyExample } from "#src/strategy/manifest.js";

export { StrategyRegistry } from "#src/strategy/registry.js";
export type { StrategyQuery } from "#src/strategy/registry.js";

export type {
  SlideIntent,
  SlideIntentConstraints,
  ResolvedSlideIntent,
} from "#src/strategy/slide-intent.js";
export { resolveSlideIntent } from "#src/strategy/slide-intent.js";

export type { DeckPlan, NarrativeArc } from "#src/strategy/deck-plan.js";

export type {
  StrategyCandidate,
  StrategyCandidateResult,
} from "#src/strategy/intent-to-strategy.js";
export { findStrategyCandidatesForIntent } from "#src/strategy/intent-to-strategy.js";

export { createSlideIntentFromArchetype } from "#src/strategy/archetype-bridge.js";

export type { StrategyCandidatePromptItem } from "#src/strategy/strategy-prompt.js";
export { toStrategyCandidatePromptItems } from "#src/strategy/strategy-prompt.js";

export type {
  StrategySelectionInput,
  StrategySelection,
  StrategySelector,
} from "#src/strategy/strategy-selector.js";

export { DeterministicStrategySelector } from "#src/strategy/deterministic-strategy-selector.js";

export type {
  StrategySelectionPrompt,
  LlmStrategySelectionResponse,
  LlmStrategyValidationResult,
} from "#src/strategy/llm-strategy-selector-types.js";
export {
  buildStrategySelectionPrompt,
  validateLlmStrategySelectionResponse,
} from "#src/strategy/llm-strategy-selector-types.js";

export { selectStrategyForIntent } from "#src/strategy/select-strategy-for-intent.js";

export type { DeckStrategySelectionResult } from "#src/strategy/select-strategies-for-deck.js";
export { selectStrategiesForDeck } from "#src/strategy/select-strategies-for-deck.js";

export { applyStrategySelectionToLegacySlideSpec } from "#src/strategy/legacy-bridge.js";

export type { StrategySelectionTrace } from "#src/strategy/strategy-selection-trace.js";
export { toStrategySelectionTrace } from "#src/strategy/strategy-selection-trace.js";

export {
  kpiCardOverviewManifest,
  kpiDashboardWithInsightManifest,
  decisionRequestManifest,
  recommendationComparisonManifest,
  actionPlanTableManifest,
  processFlowWithImpactManifest,
  implementationRoadmapManifest,
  layeredArchitectureManifest,
  dataInsightStoryManifest,
  smallMultiplesTrendManifest,
  optionComparisonTableManifest,
  oneMessageSummaryManifest,
  threePointSummaryManifest,
  twoColumnComparisonManifest,
  eventTimelineManifest,
  metricTileDashboardManifest,
  twoAxisMatrixManifest,
} from "#src/strategy/builtin-manifests.js";

import { StrategyRegistry } from "#src/strategy/registry.js";
import {
  kpiCardOverviewManifest,
  kpiDashboardWithInsightManifest,
  decisionRequestManifest,
  recommendationComparisonManifest,
  actionPlanTableManifest,
  processFlowWithImpactManifest,
  implementationRoadmapManifest,
  layeredArchitectureManifest,
  dataInsightStoryManifest,
  smallMultiplesTrendManifest,
  optionComparisonTableManifest,
  oneMessageSummaryManifest,
  threePointSummaryManifest,
  twoColumnComparisonManifest,
  eventTimelineManifest,
  metricTileDashboardManifest,
  twoAxisMatrixManifest,
} from "#src/strategy/builtin-manifests.js";

/**
 * Creates a pre-populated registry with all built-in strategy manifests.
 */
export function createBuiltinStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  const manifests = [
    kpiCardOverviewManifest,
    kpiDashboardWithInsightManifest,
    decisionRequestManifest,
    recommendationComparisonManifest,
    actionPlanTableManifest,
    processFlowWithImpactManifest,
    implementationRoadmapManifest,
    layeredArchitectureManifest,
    dataInsightStoryManifest,
    smallMultiplesTrendManifest,
    optionComparisonTableManifest,
    oneMessageSummaryManifest,
    threePointSummaryManifest,
    twoColumnComparisonManifest,
    eventTimelineManifest,
    metricTileDashboardManifest,
    twoAxisMatrixManifest,
  ];
  for (const m of manifests) {
    registry.register(m);
  }
  return registry;
}
