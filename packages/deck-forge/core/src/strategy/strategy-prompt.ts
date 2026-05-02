/**
 * Converts strategy candidates into LLM-friendly prompt payload items.
 *
 * The output is a plain JSON-serializable array suitable for inclusion
 * in a system/user prompt to an LLM strategy selector (Phase 8C).
 * Contains NO functions, class instances, or layout objects.
 */

import type { DensityLevel } from "#src/strategy/types.js";
import type { StrategyManifest } from "#src/strategy/manifest.js";
import type { StrategyCandidate } from "#src/strategy/intent-to-strategy.js";

export interface StrategyCandidatePromptItem {
  id: string;
  name: string;
  description: string;
  chooseWhen: string[];
  avoidWhen: string[];
  density: DensityLevel;
  capabilities?: StrategyManifest["capabilities"];
  limits?: StrategyManifest["limits"];
  reasons: string[];
}

/**
 * Transforms strategy candidates into plain prompt items for LLM consumption.
 */
export function toStrategyCandidatePromptItems(
  candidates: StrategyCandidate[],
): StrategyCandidatePromptItem[] {
  return candidates.map((c) => ({
    id: c.manifest.id,
    name: c.manifest.name,
    description: c.manifest.description,
    chooseWhen: c.manifest.chooseWhen,
    avoidWhen: c.manifest.avoidWhen,
    density: c.manifest.density,
    capabilities: c.manifest.capabilities,
    limits: c.manifest.limits,
    reasons: c.reasons,
  }));
}
