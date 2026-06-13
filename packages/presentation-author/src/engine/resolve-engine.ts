import {
  DEFAULT_PRESENTATION_AUTHOR_ENGINE,
  PRESENTATION_AUTHOR_ENGINE_ENV,
  PRESENTATION_AUTHOR_ENGINES,
  type PresentationAuthorEngine,
  UnknownPresentationAuthorEngineError,
} from './types.js';

function isPresentationAuthorEngine(value: string): value is PresentationAuthorEngine {
  return (PRESENTATION_AUTHOR_ENGINES as readonly string[]).includes(value);
}

/**
 * Resolve the active presentation author engine.
 *
 * Precedence: explicit argument > `PRESENTATION_AUTHOR_ENGINE` env > default
 * (`agentra-pptxgenjs`). Empty / whitespace values are treated as unset so the
 * default behaviour is preserved.
 *
 * @throws {UnknownPresentationAuthorEngineError} when a non-empty value does
 * not match a known engine. Callers should map this to a safe degrade.
 */
export function resolvePresentationAuthorEngine(
  explicit?: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): PresentationAuthorEngine {
  const explicitTrimmed = explicit?.trim();
  if (explicitTrimmed) {
    if (isPresentationAuthorEngine(explicitTrimmed)) return explicitTrimmed;
    throw new UnknownPresentationAuthorEngineError(explicitTrimmed);
  }

  const fromEnv = env[PRESENTATION_AUTHOR_ENGINE_ENV]?.trim();
  if (fromEnv) {
    if (isPresentationAuthorEngine(fromEnv)) return fromEnv;
    throw new UnknownPresentationAuthorEngineError(fromEnv);
  }

  return DEFAULT_PRESENTATION_AUTHOR_ENGINE;
}
