import {
  buildSdpmWorkspaceUploadItems,
  readSdpmWorkspace as realReadSdpmWorkspace,
} from '@agentra/presentation-author';
import {
  type GenerateDeckPreviewDeps,
  type GenerateDeckPreviewResult,
  generateDeckPreview as realGenerateDeckPreview,
} from './deck-preview.js';

export interface GenerateSdpmDeckPreviewInput {
  /** SDPM-generated PPTX path. */
  pptxPath: string;
  /** SDPM workspace directory (deck.json / specs/ / slides/). */
  workspaceDir: string;
  /** Scratch dir for the compose pipeline (PPTX → SVG → compose). */
  workDir: string;
  deckId: string;
  name: string;
  language: 'ja' | 'en';
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
}

export interface GenerateSdpmDeckPreviewDeps extends GenerateDeckPreviewDeps {
  /** Injectable for tests. */
  readSdpmWorkspace?: typeof realReadSdpmWorkspace;
  generateDeckPreview?: typeof realGenerateDeckPreview;
}

/**
 * Connect SDPM Skill output to the existing DeckResult / DeckPreview pipeline
 * (Epic #442 / #448).
 *
 * SDPM does not (yet) emit Agentra compose/defs, so the preview is produced by
 * the **existing PPTX → SVG → compose fallback** on the SDPM PPTX, exactly like
 * the agentra-pptxgenjs path. The SDPM Workspace files (specs, slide JSON, richer
 * deck.json/outline) are additionally uploaded under the same `decks/{deckId}/`
 * prefix so the BFF snapshot's workspace projection (#446) is populated and the
 * frontend can join compose slides (positional `slide-N`) to workspace skeletons
 * by **index**.
 *
 * Never throws: a missing/partial workspace or a failed compose degrades to the
 * PPTX-only result, mirroring {@link realGenerateDeckPreview}.
 */
export async function generateSdpmDeckPreview(
  input: GenerateSdpmDeckPreviewInput,
  deps: GenerateSdpmDeckPreviewDeps,
): Promise<GenerateDeckPreviewResult> {
  const readSdpmWorkspace = deps.readSdpmWorkspace ?? realReadSdpmWorkspace;
  const generateDeckPreview = deps.generateDeckPreview ?? realGenerateDeckPreview;

  const warnings: string[] = [];
  let extraUploadItems: ReturnType<typeof buildSdpmWorkspaceUploadItems> = [];
  try {
    const workspace = await readSdpmWorkspace(input.workspaceDir, {
      name: input.name,
      language: input.language,
    });
    warnings.push(...workspace.warnings);
    extraUploadItems = buildSdpmWorkspaceUploadItems(input.deckId, workspace);
  } catch (err) {
    // Reading/normalizing the SDPM workspace must never break the PPTX preview.
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`SDPM workspace sync skipped: ${msg}`);
  }

  const result = await generateDeckPreview(
    {
      pptxPath: input.pptxPath,
      workDir: input.workDir,
      deckId: input.deckId,
      name: input.name,
      language: input.language,
      bucketName: input.bucketName,
      presignExpiresSeconds: input.presignExpiresSeconds,
      extraUploadItems,
    },
    deps,
  );

  return { deck: result.deck, warnings: [...warnings, ...result.warnings] };
}
