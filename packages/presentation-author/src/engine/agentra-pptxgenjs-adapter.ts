import { runPresentationAuthor } from '../runner.js';
import type {
  PresentationAuthorDeps,
  PresentationAuthorInput,
  PresentationAuthorResult,
} from '../types.js';
import type {
  PresentationAuthorEngineAdapter,
  PresentationAuthorEngineResult,
} from './types.js';

/** Signature of the underlying PptxGenJS author function (injectable for tests). */
export type RunPresentationAuthorFn = (
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
) => Promise<PresentationAuthorResult>;

/**
 * Wraps the existing PptxGenJS authoring pipeline as a
 * {@link PresentationAuthorEngineAdapter}. Behaviour is identical to calling
 * {@link runPresentationAuthor} directly; this adapter only normalizes the
 * result onto the engine boundary and passes the full result through under
 * `authorResult`.
 */
export function createAgentraPptxgenjsAdapter(
  runAuthor: RunPresentationAuthorFn = runPresentationAuthor,
): PresentationAuthorEngineAdapter {
  return {
    engine: 'agentra-pptxgenjs',
    async createPresentation(input, deps): Promise<PresentationAuthorEngineResult> {
      const result = await runAuthor(input, deps);
      return {
        engine: 'agentra-pptxgenjs',
        pptxPath: result.pptxPath,
        sourcePath: result.sourceJsPath,
        workspaceDir: result.workDir,
        warnings: result.warnings,
        authorResult: result,
      };
    },
  };
}
