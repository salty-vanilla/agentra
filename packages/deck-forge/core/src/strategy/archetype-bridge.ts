/**
 * Archetype bridge — converts legacy archetype-based specs to SlideIntent.
 *
 * This module helps transition from the old archetype → preferredStrategyId
 * mapping to the new SlideIntent-based strategy selection.
 */

import type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";
import type { SlideIntent } from "#src/strategy/slide-intent.js";

/**
 * Maps old archetype names to their semantic SlideIntent equivalents.
 */
const ARCHETYPE_INTENT_MAP: Record<
  string,
  { intent: CommunicationIntent; contentKinds: ContentKind[] }
> = {
  title: { intent: "summarize", contentKinds: ["title"] },
  kpi_summary: { intent: "report", contentKinds: ["kpi"] },
  cause_analysis: { intent: "diagnose", contentKinds: ["root-cause", "chart"] },
  trend_small_multiples: { intent: "report", contentKinds: ["chart"] },
  process_with_impact: { intent: "explain", contentKinds: ["process", "flow"] },
  approval_request: { intent: "decide", contentKinds: ["decision"] },
  action_plan_table: { intent: "plan", contentKinds: ["action-plan", "table"] },
  comparison: { intent: "compare", contentKinds: ["comparison"] },
  roadmap: { intent: "plan", contentKinds: ["timeline"] },
  architecture: { intent: "explain", contentKinds: ["architecture"] },
  generic_content: { intent: "summarize", contentKinds: ["summary"] },
};

/**
 * Maps old archetype names to preferred strategy IDs.
 * Used only as a preferredStrategyId hint in the bridge.
 */
const ARCHETYPE_TO_STRATEGY_ID: Record<string, string> = {
  title: "title-slide",
  kpi_summary: "kpi-card-overview",
  cause_analysis: "data-insight-story",
  trend_small_multiples: "small-multiples-trend",
  process_with_impact: "process-flow-with-impact",
  approval_request: "decision-request",
  action_plan_table: "action-plan-table",
  comparison: "two-column-comparison",
  roadmap: "implementation-roadmap",
  architecture: "layered-architecture",
  generic_content: "content-standard",
};

/**
 * Creates a SlideIntent from an old-style archetype.
 */
export function createSlideIntentFromArchetype(input: {
  archetype: string;
  keyMessage: string;
  audience: AudienceType;
  genre: PresentationGenre;
  density?: DensityLevel;
}): SlideIntent {
  const mapped = ARCHETYPE_INTENT_MAP[input.archetype];
  const preferredStrategyId = ARCHETYPE_TO_STRATEGY_ID[input.archetype];

  return {
    keyMessage: input.keyMessage,
    intent: mapped?.intent ?? "summarize",
    contentKinds: mapped?.contentKinds ?? ["summary"],
    audience: input.audience,
    genre: input.genre,
    density: input.density,
    archetype: input.archetype,
    preferredStrategyId,
  };
}
