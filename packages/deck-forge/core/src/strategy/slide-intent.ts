/**
 * SlideIntent — semantic description of what a slide should communicate.
 *
 * SlideIntent is NOT a rendering instruction. It carries no coordinates,
 * shapes, or visual properties. It is the input to Strategy selection.
 */

import type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";

export interface SlideIntent {
  id?: string;

  /** The single most important message this slide should communicate. */
  keyMessage: string;

  /** What the audience should take away from this slide. */
  audienceTakeaway?: string;

  /** What communicative role this slide plays. */
  intent: CommunicationIntent;

  /** What kind of content this slide primarily contains. */
  contentKinds: ContentKind[];

  /** Intended audience. If omitted, inherit from DeckPlan. */
  audience?: AudienceType;

  /** Presentation genre. If omitted, inherit from DeckPlan. */
  genre?: PresentationGenre;

  /** Desired information density. */
  density?: DensityLevel;

  /**
   * Optional existing archetype bridge.
   * Temporary — helps transition from old archetype mapping.
   */
  archetype?: string;

  /** Optional user or planner constraints. */
  constraints?: SlideIntentConstraints;

  /**
   * Optional explicit strategy preference.
   * Treated as a preference, not a low-level rendering instruction.
   */
  preferredStrategyId?: string;

  /** Optional negative strategy hints. */
  avoidStrategyIds?: string[];
}

export interface SlideIntentConstraints {
  maxItems?: number;
  requiresChart?: boolean;
  requiresTable?: boolean;
  requiresIcons?: boolean;
  requiresImages?: boolean;
  maxTextLength?: number;
}

/**
 * A fully-resolved SlideIntent with no optional audience/genre/density.
 */
export interface ResolvedSlideIntent extends SlideIntent {
  audience: AudienceType;
  genre: PresentationGenre;
  density: DensityLevel;
}

/**
 * Resolves optional fields by inheriting from deck-level defaults.
 *
 * Resolution order:
 * - audience: slide → deck → (required, so deck must provide)
 * - genre: slide → deck → (required, so deck must provide)
 * - density: slide → deck → "medium"
 */
export function resolveSlideIntent(
  intent: SlideIntent,
  deckDefaults: {
    audience: AudienceType;
    genre: PresentationGenre;
    density?: DensityLevel;
  },
): ResolvedSlideIntent {
  return {
    ...intent,
    audience: intent.audience ?? deckDefaults.audience,
    genre: intent.genre ?? deckDefaults.genre,
    density: intent.density ?? deckDefaults.density ?? "medium",
  };
}
