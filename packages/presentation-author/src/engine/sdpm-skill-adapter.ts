import type { PresentationAuthorEngineAdapter } from './types.js';
import { PresentationAuthorEngineNotImplementedError } from './types.js';

/**
 * Placeholder adapter for the SDPM Skill (Layer 1) engine.
 *
 * The real implementation lands in later issues (#446 Workspace bridge, #448
 * DeckResult connection). Until then this adapter throws a clear, actionable
 * error so selecting `sdpm-skill` degrades safely rather than silently
 * producing nothing.
 *
 * The interface shape (`workspaceDir` / `deckJsonPath` / `slideJsonPaths`) is
 * the contract those issues will fulfil.
 */
export function createSdpmSkillAdapter(): PresentationAuthorEngineAdapter {
  return {
    engine: 'sdpm-skill',
    async createPresentation() {
      throw new PresentationAuthorEngineNotImplementedError(
        'sdpm-skill',
        'SDPM Skill engine is wired in #446/#448.',
      );
    },
  };
}
