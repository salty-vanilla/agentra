import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AuthorSdpmWorkspaceFn, authorSdpmWorkspace } from './sdpm-skill-author.js';
import {
  materializeSdpmWorkspace,
  type RunSdpmGenerateFn,
  runSdpmGenerate,
} from './sdpm-skill-runner.js';
import type {
  PresentationAuthorEngineAdapter,
  PresentationAuthorEngineResult,
} from './types.js';
import { PresentationAuthorEngineNotImplementedError } from './types.js';

export interface SdpmSkillAdapterOptions {
  /** Author the SDPM workspace from the prompt (default: single LLM call). */
  authorWorkspace?: AuthorSdpmWorkspaceFn | undefined;
  /** Run `pptx_builder.py generate` (default: subprocess to the vendored skill). */
  runGenerate?: RunSdpmGenerateFn | undefined;
  /** Root under which a per-run workspace dir is created (default: os tmpdir). */
  workspaceRoot?: string | undefined;
}

/**
 * SDPM Skill (Layer 1) engine adapter (#442 / #448).
 *
 * Pipeline: author Deck Workspace (LLM) → materialize on disk → `generate` PPTX.
 * Returns the engine result (`pptxPath` + `workspaceDir` + `deckJsonPath` +
 * `slideJsonPaths`) that the runtime connects to the DeckResult / DeckPreview
 * pipeline (#448) and the BFF workspace snapshot (#446).
 *
 * Throws `PresentationAuthorEngineNotImplementedError` when the PPTX could not be
 * produced (e.g. the vendored skill is not configured), so the tool degrades with
 * a clear, actionable message instead of returning an empty result.
 */
export function createSdpmSkillAdapter(
  options: SdpmSkillAdapterOptions = {},
): PresentationAuthorEngineAdapter {
  const author = options.authorWorkspace ?? authorSdpmWorkspace;
  const generate = options.runGenerate ?? runSdpmGenerate;

  return {
    engine: 'sdpm-skill',
    async createPresentation(input, deps): Promise<PresentationAuthorEngineResult> {
      const root = options.workspaceRoot ?? tmpdir();
      const workspaceDir = await mkdtemp(join(root, 'sdpm-ws-'));
      const pptxPath = join(workspaceDir, 'deck.pptx');

      const spec = await author(input, deps);
      const { deckJsonPath, slideJsonPaths } = await materializeSdpmWorkspace(
        workspaceDir,
        spec,
      );

      const gen = await generate({ workspaceDir, pptxPath });
      if (!gen.success || !gen.pptxPath) {
        throw new PresentationAuthorEngineNotImplementedError(
          'sdpm-skill',
          gen.warnings.join('; ') || 'SDPM generate produced no PPTX.',
        );
      }

      return {
        engine: 'sdpm-skill',
        pptxPath: gen.pptxPath,
        workspaceDir,
        deckJsonPath,
        slideJsonPaths,
        warnings: gen.warnings,
      };
    },
  };
}
