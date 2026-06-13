import type { PresentationAuthorDeps, PresentationAuthorInput } from '../types.js';
import { createAgentraPptxgenjsAdapter } from './agentra-pptxgenjs-adapter.js';
import { resolvePresentationAuthorEngine } from './resolve-engine.js';
import { createSdpmSkillAdapter } from './sdpm-skill-adapter.js';
import type {
  PresentationAuthorEngine,
  PresentationAuthorEngineAdapter,
  PresentationAuthorEngineResult,
} from './types.js';

export interface RunPresentationAuthorEngineOptions {
  /**
   * Explicit engine selection. Overrides the `PRESENTATION_AUTHOR_ENGINE` env.
   * When omitted, the env (then the default) decides.
   */
  engine?: string | undefined;
  /** Override the env source (testing). */
  env?: NodeJS.ProcessEnv | undefined;
  /** Override adapters (testing). */
  adapters?: Partial<Record<PresentationAuthorEngine, PresentationAuthorEngineAdapter>>;
}

function defaultAdapters(): Record<
  PresentationAuthorEngine,
  PresentationAuthorEngineAdapter
> {
  return {
    'agentra-pptxgenjs': createAgentraPptxgenjsAdapter(),
    'sdpm-skill': createSdpmSkillAdapter(),
  };
}

/** Resolve the adapter for the active engine without running it. */
export function selectPresentationAuthorAdapter(
  options: RunPresentationAuthorEngineOptions = {},
): PresentationAuthorEngineAdapter {
  const engine = resolvePresentationAuthorEngine(options.engine, options.env);
  const adapters = { ...defaultAdapters(), ...options.adapters };
  return adapters[engine];
}

/**
 * Resolve the configured engine and run it. For `agentra-pptxgenjs` (default)
 * this is behaviourally identical to calling `runPresentationAuthor` directly.
 */
export async function runPresentationAuthorEngine(
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
  options: RunPresentationAuthorEngineOptions = {},
): Promise<PresentationAuthorEngineResult> {
  const adapter = selectPresentationAuthorAdapter(options);
  return adapter.createPresentation(input, deps);
}
