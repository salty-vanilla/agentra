/**
 * Strategy module barrel export.
 *
 * Re-exports types, manifest interface, registry, and built-in manifests.
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
