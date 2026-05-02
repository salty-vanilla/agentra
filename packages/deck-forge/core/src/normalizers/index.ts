/**
 * Transitional fallback normalizers only.
 *
 * Native built-in strategies should consume StrategyInput directly.
 * These normalizers remain only for the legacy contentBlocks fallback path.
 *
 * TODO(Phase 8H+): remove after runtime pipeline no longer emits contentBlocks.
 */
export { normalizeKpiSummaryContent } from "#src/normalizers/normalize-kpi-summary.js";
export type { NormalizedKpiSummaryContent } from "#src/normalizers/normalize-kpi-summary.js";
export { normalizeDecisionContent } from "#src/normalizers/normalize-decision-request.js";
export type { NormalizedDecisionContent } from "#src/normalizers/normalize-decision-request.js";
