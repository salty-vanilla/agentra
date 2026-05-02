/**
 * Intent-to-Strategy candidate selection.
 *
 * Given a ResolvedSlideIntent and a StrategyRegistry, finds the best
 * candidate strategies using filtering and basic scoring.
 * Phase 8B: filtering-based. Phase 8C will add LLM reranking.
 */

import type { StrategyManifest } from "#src/strategy/manifest.js";
import type { StrategyRegistry } from "#src/strategy/registry.js";
import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";

export interface StrategyCandidate {
  manifest: StrategyManifest;
  reasons: string[];
}

export interface StrategyCandidateResult {
  candidates: StrategyCandidate[];
  warnings: string[];
}

/**
 * Finds strategy candidates for the given resolved slide intent.
 *
 * Filtering logic:
 * 1. Exclude avoidStrategyIds
 * 2. If preferredStrategyId is valid, place it first
 * 3. Score remaining manifests by overlap with intent fields
 * 4. Return top 5 candidates with reasons
 */
export function findStrategyCandidatesForIntent(
  intent: ResolvedSlideIntent,
  registry: StrategyRegistry,
): StrategyCandidateResult {
  const warnings: string[] = [];
  const allManifests = registry.listStrategyManifests();

  // Handle avoidStrategyIds
  const avoidSet = new Set(intent.avoidStrategyIds ?? []);
  const eligible = allManifests.filter((m) => !avoidSet.has(m.id));

  // Handle preferredStrategyId
  let preferred: StrategyCandidate | undefined;
  if (intent.preferredStrategyId) {
    const preferredManifest = registry.getStrategyManifest(intent.preferredStrategyId);
    if (preferredManifest) {
      if (!avoidSet.has(preferredManifest.id)) {
        preferred = {
          manifest: preferredManifest,
          reasons: ["explicit preferredStrategyId"],
        };
      }
    } else {
      warnings.push(
        `Unknown preferredStrategyId "${intent.preferredStrategyId}"; ignoring preference.`,
      );
    }
  }

  // Score each eligible manifest
  const scored: Array<{ manifest: StrategyManifest; score: number; reasons: string[] }> = [];

  for (const m of eligible) {
    // Skip the preferred one from scoring — it goes first regardless
    if (preferred && m.id === preferred.manifest.id) continue;

    const reasons: string[] = [];
    let score = 0;

    // Audience match
    if (m.audiences.includes(intent.audience)) {
      score += 3;
      reasons.push(`matches audience: ${intent.audience}`);
    }

    // Genre match
    if (m.suitableFor.includes(intent.genre)) {
      score += 3;
      reasons.push(`matches genre: ${intent.genre}`);
    }

    // Intent match
    if (m.intents.includes(intent.intent)) {
      score += 2;
      reasons.push(`matches intent: ${intent.intent}`);
    }

    // ContentKind overlap
    const kindOverlap = intent.contentKinds.filter((k) => m.contentKinds.includes(k));
    if (kindOverlap.length > 0) {
      score += 2 * kindOverlap.length;
      reasons.push(`matches contentKind: ${kindOverlap.join(", ")}`);
    }

    // Density match
    if (m.density === intent.density) {
      score += 1;
      reasons.push(`matches density: ${intent.density}`);
    }

    // Capability constraints
    if (intent.constraints) {
      const caps = m.capabilities;
      if (intent.constraints.requiresChart && caps?.supportsCharts) {
        score += 1;
        reasons.push("supports charts");
      }
      if (intent.constraints.requiresTable && caps?.supportsTables) {
        score += 1;
        reasons.push("supports tables");
      }
      if (intent.constraints.requiresIcons && caps?.supportsIcons) {
        score += 1;
        reasons.push("supports icons");
      }
      if (intent.constraints.requiresImages && caps?.supportsImages) {
        score += 1;
        reasons.push("supports images");
      }
    }

    if (score > 0) {
      scored.push({ manifest: m, score, reasons });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build final candidates (max 5)
  const candidates: StrategyCandidate[] = [];
  if (preferred) {
    candidates.push(preferred);
  }
  for (const s of scored) {
    if (candidates.length >= 5) break;
    candidates.push({ manifest: s.manifest, reasons: s.reasons });
  }

  return { candidates, warnings };
}
