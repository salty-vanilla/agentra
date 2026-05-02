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
