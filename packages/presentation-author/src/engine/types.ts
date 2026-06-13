import type {
  PresentationAuthorDeps,
  PresentationAuthorInput,
  PresentationAuthorResult,
} from '../types.js';

/**
 * Selectable presentation authoring engine.
 *
 * - `agentra-pptxgenjs`: the existing PptxGenJS authoring pipeline (default,
 *   fallback, legacy). Behaviour is unchanged when this engine is selected.
 * - `sdpm-skill`: the SDPM Skill (Layer 1) Workspace-first engine. Opt-in via
 *   {@link PRESENTATION_AUTHOR_ENGINE_ENV}. Implemented in later issues
 *   (#446 / #448); a placeholder adapter degrades safely until then.
 */
export type PresentationAuthorEngine = 'agentra-pptxgenjs' | 'sdpm-skill';

export const PRESENTATION_AUTHOR_ENGINES: readonly PresentationAuthorEngine[] = [
  'agentra-pptxgenjs',
  'sdpm-skill',
];

/** Default engine when nothing is specified. Keeps existing behaviour. */
export const DEFAULT_PRESENTATION_AUTHOR_ENGINE: PresentationAuthorEngine =
  'agentra-pptxgenjs';

/** Environment variable used to select the engine. */
export const PRESENTATION_AUTHOR_ENGINE_ENV = 'PRESENTATION_AUTHOR_ENGINE';

/**
 * Normalized result of an authoring engine run.
 *
 * This is the engine-agnostic boundary. Engine-specific richness (diagnostics,
 * revision, icons, images for `agentra-pptxgenjs`) is passed through under
 * {@link authorResult} so the existing tool layer keeps working unchanged.
 */
export interface PresentationAuthorEngineResult {
  /** Which engine produced this result. */
  engine: PresentationAuthorEngine;
  /** Path to the generated PPTX. Always present on success. */
  pptxPath: string;
  /** Authoring source path (e.g. PptxGenJS script). Engine-specific. */
  sourcePath?: string | undefined;
  /** Working / workspace directory containing engine artifacts. */
  workspaceDir?: string | undefined;
  /** Path to SDPM `deck.json`, when the engine produces a Deck Workspace. */
  deckJsonPath?: string | undefined;
  /** Paths to SDPM `slides/{slug}.json`, when available. */
  slideJsonPaths?: string[] | undefined;
  /** Non-fatal warnings accumulated during the run. */
  warnings: string[];
  /**
   * Full result from the `agentra-pptxgenjs` engine (diagnostics, revision,
   * icons, images). Undefined for engines that do not produce it.
   */
  authorResult?: PresentationAuthorResult | undefined;
}

/**
 * Adapter that wraps a concrete authoring engine behind a common interface.
 */
export interface PresentationAuthorEngineAdapter {
  readonly engine: PresentationAuthorEngine;
  createPresentation(
    input: PresentationAuthorInput,
    deps: PresentationAuthorDeps,
  ): Promise<PresentationAuthorEngineResult>;
}

/**
 * Thrown when an engine is selected but not yet implemented, so callers can
 * degrade with a clear, actionable message instead of a generic failure.
 */
export class PresentationAuthorEngineNotImplementedError extends Error {
  readonly engine: PresentationAuthorEngine;

  constructor(engine: PresentationAuthorEngine, detail?: string) {
    super(
      `Presentation author engine "${engine}" is not implemented yet.${
        detail ? ` ${detail}` : ''
      } Set ${PRESENTATION_AUTHOR_ENGINE_ENV}=${DEFAULT_PRESENTATION_AUTHOR_ENGINE} to use the default engine.`,
    );
    this.name = 'PresentationAuthorEngineNotImplementedError';
    this.engine = engine;
  }
}

/**
 * Thrown when an unknown engine identifier is supplied.
 */
export class UnknownPresentationAuthorEngineError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(
      `Unknown presentation author engine "${value}". Expected one of: ${PRESENTATION_AUTHOR_ENGINES.join(
        ', ',
      )}.`,
    );
    this.name = 'UnknownPresentationAuthorEngineError';
    this.value = value;
  }
}
