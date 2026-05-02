/**
 * StrategyManifest — the metadata that makes a Strategy selectable by LLMs.
 *
 * Each layout strategy registers a manifest describing when it should be used,
 * what content it handles, and its constraints. The manifest is the primary
 * interface for the Strategy Selector (Phase 8C).
 */

import type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
} from "#src/strategy/types.js";

export interface StrategyExample {
  title: string;
  audience?: AudienceType;
  genre?: PresentationGenre;
  intent?: CommunicationIntent;
  description: string;
  input?: unknown;
}

export interface StrategyManifest<TInput = unknown> {
  id: string;
  name: string;
  description: string;

  suitableFor: PresentationGenre[];
  audiences: AudienceType[];
  intents: CommunicationIntent[];
  contentKinds: ContentKind[];

  density: DensityLevel;

  /** Human-readable hints for LLM: when to pick this strategy */
  chooseWhen: string[];
  /** Human-readable hints for LLM: when NOT to pick this strategy */
  avoidWhen: string[];

  inputSchema?: unknown;
  examples?: StrategyExample[];

  capabilities?: {
    supportsCharts?: boolean;
    supportsTables?: boolean;
    supportsIcons?: boolean;
    supportsImages?: boolean;
    supportsSpeakerNotes?: boolean;
  };

  limits?: {
    minItems?: number;
    maxItems?: number;
    maxTextLength?: number;
    maxColumns?: number;
    maxRows?: number;
  };
}
