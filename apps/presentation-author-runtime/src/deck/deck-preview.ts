import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildDeckWorkspace,
  type DeckMeta,
  type DeckResult,
  composeSvg as realComposeSvg,
  exportSvg as realExportSvg,
  persistDeck as realPersistDeck,
} from '@agentra/presentation-author';
import { buildDeckPreviewEvents, type DeckPreviewEvent } from '@agentra/shared';
import type { S3Client } from '@aws-sdk/client-s3';

export interface GenerateDeckPreviewInput {
  pptxPath: string;
  workDir: string;
  deckId: string;
  name: string;
  language: 'ja' | 'en';
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
}

export interface GenerateDeckPreviewDeps {
  s3Client: S3Client;
  // Injectable for tests (real pipeline needs soffice + lxml).
  exportSvg?: typeof realExportSvg;
  composeSvg?: typeof realComposeSvg;
  persistDeck?: typeof realPersistDeck;
  /**
   * Streaming Deck Preview hook (Epic #403). Invoked synchronously at each deck
   * lifecycle stage. The slide runtime is non-streaming, so the live stream is
   * actually produced by the router's deterministic replay; this hook records
   * the *real* per-stage timeline (for logging / future true streaming). It must
   * never throw — emit failures are swallowed so they cannot break the PPTX.
   */
  onDeckEvent?: (event: DeckPreviewEvent) => void;
}

export interface GenerateDeckPreviewResult {
  deck?: DeckResult | undefined;
  warnings: string[];
}

/**
 * Build the deck Live Preview for a freshly generated PPTX:
 *   PPTX → SVG (export_svg) → compose/defs → persist to S3 → DeckResult.
 *
 * Never throws and always degrades: any failed stage returns `{ deck: undefined }`
 * with warnings, so the caller still returns the PPTX result intact.
 */
export async function generateDeckPreview(
  input: GenerateDeckPreviewInput,
  deps: GenerateDeckPreviewDeps,
): Promise<GenerateDeckPreviewResult> {
  const exportSvg = deps.exportSvg ?? realExportSvg;
  const composeSvg = deps.composeSvg ?? realComposeSvg;
  const persistDeck = deps.persistDeck ?? realPersistDeck;

  const warnings: string[] = [];

  // Emit hook that can never break the pipeline (a throwing listener is the
  // listener's bug, not ours — swallow it like every other deck-preview degrade).
  const emit = (event: DeckPreviewEvent): void => {
    try {
      deps.onDeckEvent?.(event);
    } catch {
      // intentionally ignored — deck preview must never break PPTX generation
    }
  };
  const emitFailed = (reason: string): void =>
    emit({ type: 'deck_preview_failed', deckId: input.deckId, reason });

  // Whole body is guarded so the contract truly holds: any unexpected throw
  // (mkdir EACCES, persistDeck S3 rejection, etc.) degrades to no-deck.
  try {
    emit({ type: 'deck_preview_started', deckId: input.deckId, name: input.name });

    const deckDir = join(input.workDir, 'deck');
    await mkdir(deckDir, { recursive: true });

    const svg = await exportSvg({ pptxPath: input.pptxPath, outputDir: deckDir });
    warnings.push(...svg.warnings);
    if (!svg.success || !svg.svgPath) {
      warnings.push('deck preview skipped: SVG export failed');
      emitFailed('SVG export failed');
      return { deck: undefined, warnings };
    }

    const compose = await composeSvg({ svgPath: svg.svgPath, outputDir: deckDir });
    warnings.push(...compose.warnings);
    if (!compose.success || !compose.defsPath || compose.slides.length === 0) {
      warnings.push('deck preview skipped: compose produced no slides');
      emitFailed('compose produced no slides');
      return { deck: undefined, warnings };
    }

    const meta: DeckMeta = {
      deckId: input.deckId,
      name: input.name,
      language: input.language,
    };

    const workspace = buildDeckWorkspace(meta, {
      defsPath: compose.defsPath,
      pptxPath: input.pptxPath,
      slides: compose.slides.map((s) => ({
        slug: s.slug,
        index: s.index,
        composePath: s.composePath,
      })),
    });

    const persisted = await persistDeck(
      {
        workspace,
        meta,
        bucketName: input.bucketName,
        presignExpiresSeconds: input.presignExpiresSeconds,
      },
      { s3Client: deps.s3Client },
    );
    warnings.push(...persisted.warnings);

    if (!persisted.deck) {
      emitFailed('deck persist produced no result');
      return { deck: undefined, warnings };
    }

    // Replay the persisted deck's per-slide + completed events (the started
    // event was already emitted above with the same deckId). Reuses the shared
    // builder so the runtime timeline matches the router's replay exactly.
    for (const event of buildDeckPreviewEvents(persisted.deck)) {
      if (event.type !== 'deck_preview_started') emit(event);
    }

    return { deck: persisted.deck, warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`deck preview skipped: ${msg}`);
    emitFailed(msg);
    return { deck: undefined, warnings };
  }
}

/** Derive a short human-readable deck name from the user prompt. */
export function deriveDeckName(prompt: string): string {
  const firstLine = prompt
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const name = (firstLine ?? 'presentation').slice(0, 80);
  return name.length > 0 ? name : 'presentation';
}
