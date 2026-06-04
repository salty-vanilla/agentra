import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DECK_PREFIX,
  type DeckResult,
  generatePerSlideDeck,
  type PerSlideDeckDeps,
  type PerSlidePersistedSlide,
  type PerSlidePersistInput,
  composeSvg as realComposeSvg,
  exportSvg as realExportSvg,
  splitPptx as realSplitPptx,
} from '@agentra/presentation-author';
import type { DeckPreviewEvent } from '@agentra/shared';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600;
const JSON_CONTENT_TYPE = 'application/json';
/**
 * Safe S3 key segment: must start alphanumeric, then letters/digits/dot/dash/
 * underscore (no leading dot, no `/`, no `..`).
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isSafeSegment(value: string): boolean {
  return SAFE_SEGMENT.test(value) && !value.includes('..');
}

export interface GenerateDeckPreviewStreamingInput {
  pptxPath: string;
  workDir: string;
  deckId: string;
  name: string;
  language: 'ja' | 'en';
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
}

export interface GenerateDeckPreviewStreamingDeps {
  s3Client: S3Client;
  // Injectable for tests (the real pipeline needs python-pptx + soffice + lxml).
  splitPptx?: PerSlideDeckDeps['splitPptx'];
  exportSvg?: PerSlideDeckDeps['exportSvg'];
  composeSvg?: PerSlideDeckDeps['composeSvg'];
  /** Override the S3 slide-persist (tests inject a fake to avoid real uploads). */
  persistSlide?: PerSlideDeckDeps['persistSlide'];
  /** Same hook as the batch pipeline — invoked in *real time* per slide. */
  onDeckEvent?: (event: DeckPreviewEvent) => void;
}

export interface GenerateDeckPreviewStreamingResult {
  deck?: DeckResult | undefined;
  warnings: string[];
  /** True when the per-slide pipeline produced the deck; false → caller degrades. */
  streamed: boolean;
}

/**
 * Build a per-slide S3 persist function: uploads each slide's compose JSON (and,
 * on the first slide, the shared defs) under an **epoch-versioned** key so the
 * client can detect changes, then returns presigned URLs. Never throws — a
 * failed upload/presign yields `null` so the orchestrator skips that slide.
 */
export function createS3SlidePersist(opts: {
  s3Client: S3Client;
  bucketName: string;
  presignExpiresSeconds?: number | undefined;
  warnings: string[];
}): PerSlideDeckDeps['persistSlide'] {
  const expiresIn = opts.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS;
  // One epoch per run (not per slide) so a deck's compose + defs keys share the
  // same version stamp — the basis for the epoch-keyed defs union in #422. A
  // later re-run (revision, #426) mints a new epoch, changing every URL.
  const epoch = Date.now();

  async function put(key: string, body: Uint8Array, deckId: string, role: string) {
    await opts.s3Client.send(
      new PutObjectCommand({
        Bucket: opts.bucketName,
        Key: key,
        Body: body,
        ContentType: JSON_CONTENT_TYPE,
        Metadata: { deckId, role },
      }),
    );
  }

  async function presign(key: string): Promise<string | null> {
    try {
      return await getSignedUrl(
        opts.s3Client,
        new GetObjectCommand({ Bucket: opts.bucketName, Key: key }),
        { expiresIn },
      );
    } catch (err) {
      // Don't leak the full S3 key (bucket layout / epoch) into warnings, which
      // are serialized back into the LLM tool result. Keep the reason generic.
      opts.warnings.push(`Failed to presign a deck artifact: ${errMsg(err)}`);
      return null;
    }
  }

  return async function persistSlide(
    input: PerSlidePersistInput,
  ): Promise<PerSlidePersistedSlide | null> {
    if (!isSafeSegment(input.deckId) || !isSafeSegment(input.slug)) {
      opts.warnings.push(`slide ${input.index} skipped: unsafe deckId/slug`);
      return null;
    }
    const composeKey = `${DECK_PREFIX}/${input.deckId}/slides/${input.slug}.${epoch}.compose.json`;
    try {
      await put(composeKey, await readFile(input.composePath), input.deckId, 'compose');
      const composeUrl = await presign(composeKey);

      // Deck-wide defs uploaded once (from the first slide). NOTE (#422): a
      // single-slide SVG's defs only covers that slide, so slides 2..N can
      // reference ids absent here — the proper fix is a per-run defs *union*,
      // tracked in #422. Until then the per-slide path is opt-in and dormant.
      let defsUrl: string | null = null;
      if (input.isFirst) {
        const defsKey = `${DECK_PREFIX}/${input.deckId}/preview/defs.${epoch}.json`;
        await put(defsKey, await readFile(input.defsPath), input.deckId, 'defs');
        defsUrl = await presign(defsKey);
      }

      return {
        slug: input.slug,
        index: input.index,
        composeUrl,
        previewUrl: null,
        defsUrl,
      };
    } catch (err) {
      opts.warnings.push(`slide ${input.index} persist failed: ${errMsg(err)}`);
      return null;
    }
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Per-slide ("Route R4", Epic #417/#419) deck Live Preview: split the authored
 * PPTX, then export→compose→upload→emit one slide at a time so the client
 * reveals slide 1 before slide N has rendered.
 *
 * Never throws and always degrades: if the per-slide pipeline can't produce any
 * slide it returns `{ streamed: false }` and a `deck_preview_failed` event, and
 * the caller falls back to the batch `generateDeckPreview`.
 */
export async function generateDeckPreviewStreaming(
  input: GenerateDeckPreviewStreamingInput,
  deps: GenerateDeckPreviewStreamingDeps,
): Promise<GenerateDeckPreviewStreamingResult> {
  const warnings: string[] = [];

  const emit = (event: DeckPreviewEvent): void => {
    try {
      deps.onDeckEvent?.(event);
    } catch {
      // deck preview must never break PPTX generation
    }
  };

  const persistSlide =
    deps.persistSlide ??
    createS3SlidePersist({
      s3Client: deps.s3Client,
      bucketName: input.bucketName,
      presignExpiresSeconds: input.presignExpiresSeconds,
      warnings,
    });

  // The shared defs URL arrives on the first slide; repeat it on every event so
  // a late-joining client can render any slide it sees.
  let sharedDefsUrl: string | null = null;
  let totalSlides = 0;

  try {
    const result = await generatePerSlideDeck(
      {
        pptxPath: input.pptxPath,
        outputDir: join(input.workDir, 'deck'),
        deckId: input.deckId,
        name: input.name,
        language: input.language,
      },
      {
        splitPptx: deps.splitPptx ?? realSplitPptx,
        exportSvg: deps.exportSvg ?? realExportSvg,
        composeSvg: deps.composeSvg ?? realComposeSvg,
        persistSlide,
        onStart: (count) => {
          totalSlides = count;
          emit({
            type: 'deck_preview_started',
            deckId: input.deckId,
            name: input.name,
            totalSlides: count,
          });
        },
        onSlideReady: (slide) => {
          if (slide.defsUrl) sharedDefsUrl = slide.defsUrl;
          emit({
            type: 'deck_slide_compose_ready',
            deckId: input.deckId,
            slug: slide.slug,
            index: slide.index,
            totalSlides,
            composeUrl: slide.composeUrl,
            defsUrl: sharedDefsUrl,
            previewUrl: slide.previewUrl,
          });
        },
      },
    );
    warnings.push(...result.warnings);

    if (!result.ok || result.slides.length === 0) {
      emit({
        type: 'deck_preview_failed',
        deckId: input.deckId,
        reason: 'per-slide pipeline produced no slides',
      });
      return { deck: undefined, warnings, streamed: false };
    }

    emit({ type: 'deck_preview_completed', deckId: input.deckId, totalSlides });

    const ordered = [...result.slides].sort((a, b) => a.index - b.index);
    const deck: DeckResult = {
      deckId: input.deckId,
      name: input.name,
      language: input.language,
      slideOrder: ordered.map((s) => s.slug),
      defsUrl: sharedDefsUrl,
      pptxDownloadUrl: null,
      specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
      slides: ordered.map((s) => ({
        slug: s.slug,
        previewUrl: s.previewUrl,
        composeUrl: s.composeUrl,
      })),
      version: 1,
    };
    return { deck, warnings, streamed: true };
  } catch (err) {
    const msg = errMsg(err);
    warnings.push(`deck preview (streaming) skipped: ${msg}`);
    emit({ type: 'deck_preview_failed', deckId: input.deckId, reason: msg });
    return { deck: undefined, warnings, streamed: false };
  }
}
