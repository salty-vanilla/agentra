/**
 * DeckPlan — high-level semantic plan for an entire presentation.
 *
 * A DeckPlan captures the overall narrative structure and contains
 * SlideIntents that describe what each slide should communicate.
 * It is NOT a layout or rendering specification.
 */

import type {
  AudienceType,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";
import type { SlideIntent } from "#src/strategy/slide-intent.js";

export type NarrativeArc =
  | "problem-impact-solution-plan"
  | "context-architecture-tradeoff-decision"
  | "question-method-result-interpretation"
  | "current-state-issue-root-cause-action"
  | "overview-detail-action"
  | "concept-example-practice"
  | "custom";

export interface DeckPlan {
  id?: string;
  title?: string;
  objective?: string;

  audience: AudienceType;
  genre: PresentationGenre;
  density?: DensityLevel;

  /** High-level narrative structure. */
  narrativeArc?: NarrativeArc;

  /** Semantic slide plan. */
  slides: SlideIntent[];
}
