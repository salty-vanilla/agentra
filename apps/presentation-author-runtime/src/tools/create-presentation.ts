import {
  type CreatePresentationToolInput,
  type CreatePresentationToolOutput,
  createPresentation,
  type DeckResult,
} from '@agentra/presentation-author';
import type { DeckPhase, DeckPreviewEvent } from '@agentra/shared';
import { S3Client } from '@aws-sdk/client-s3';
import { tool } from '@strands-agents/sdk';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import type { UploadedPresentationArtifact } from '../artifacts/artifact-upload-types.js';
import { uploadPresentationArtifacts } from '../artifacts/s3-artifact-uploader.js';
import { deriveDeckName, generateDeckPreview } from '../deck/deck-preview.js';
import { generateDeckPreviewStreaming } from '../deck/deck-preview-streaming.js';
import { FONT_POLICY_STYLE_GUIDE } from '../font-policy.js';
import { createPresentationAuthorLlmClient } from '../llm-adapter.js';
import { logger } from '../logger.js';

type UserFacingArtifact = Omit<
  UploadedPresentationArtifact,
  'localPath' | 'bucket' | 'key' | 's3Uri'
>;

function filterUserFacingArtifacts(
  artifacts: UploadedPresentationArtifact[],
): UserFacingArtifact[] {
  return artifacts.map((artifact) => ({
    kind: artifact.kind,
    label: artifact.label,
    downloadUrl: artifact.downloadUrl,
    uploaded: artifact.uploaded,
    contentType: artifact.contentType,
    sizeBytes: artifact.sizeBytes,
  }));
}

const envDiagnostics = process.env.PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS !== 'false';
const envRevision = process.env.PRESENTATION_AUTHOR_ENABLE_REVISION !== 'false';
const envOutputDir = process.env.PRESENTATION_AUTHOR_OUTPUT_DIR;
const envBucketName = process.env.PRESENTATION_ARTIFACT_BUCKET_NAME ?? '';
const envPrefix = process.env.PRESENTATION_ARTIFACT_PREFIX ?? 'runs';
const envPresignedUrls = process.env.PRESENTATION_ARTIFACT_PRESIGNED_URLS !== 'false';
const envUrlExpires = Number.parseInt(
  process.env.PRESENTATION_ARTIFACT_URL_EXPIRES_SECONDS ?? '3600',
  10,
);
const envBrandFrameEnabled = process.env.PRESENTATION_BRAND_FRAME_ENABLED !== 'false';
const envDefaultBrandFrameId =
  process.env.PRESENTATION_DEFAULT_BRAND_FRAME_ID ?? 'company-basic-v1';
const envIconsEnabled = process.env.PRESENTATION_ICONS_ENABLED !== 'false';
const envIconProvider = process.env.PRESENTATION_ICON_PROVIDER ?? 'lucide-local';
const envImageRetrievalEnabled =
  process.env.PRESENTATION_IMAGE_RETRIEVAL_ENABLED === 'true';
const envImageGenerationEnabled =
  process.env.PRESENTATION_IMAGE_GENERATION_ENABLED === 'true';
// Opt-in (default off): build the SDPM-compatible deck Live Preview.
const envDeckPreviewEnabled = process.env.PRESENTATION_DECK_PREVIEW_ENABLED === 'true';
// Opt-in (default off): use the per-slide ("R4", Epic #419) pipeline that splits
// the PPTX and uploads/emits one slide at a time, instead of the batch pipeline.
// Degrades to the batch path automatically if it can't produce any slide.
const envDeckPreviewStreaming =
  process.env.PRESENTATION_DECK_PREVIEW_STREAMING === 'true';
// Hard budget for deck preview. It runs after PPTX success but before return,
// inside the runtime invocation cap (~120s), so a slow-but-succeeding soffice
// could otherwise push the whole call over the limit and lose the PPTX too.
// On budget exhaustion we drop the deck and still return the PPTX.
const envDeckPreviewBudgetMs = Number.parseInt(
  process.env.PRESENTATION_DECK_PREVIEW_BUDGET_MS ?? '45000',
  10,
);

const llmClient = createPresentationAuthorLlmClient();
const s3Client = envBucketName ? new S3Client({}) : undefined;

export interface SlideRuntimePresentationResult extends CreatePresentationToolOutput {
  uploadedArtifacts?: UserFacingArtifact[] | undefined;
  pptxDownloadUrl?: string | undefined;
  contactSheetDownloadUrl?: string | undefined;
  deck?: DeckResult | undefined;
}

export interface ExecuteCreatePresentationOptions {
  /**
   * Real-time deck event sink (Epic #420). When the streaming slide-runtime
   * handler is active it forwards these out as SSE; otherwise events are only
   * logged. Always invoked in addition to logging; must not throw.
   */
  onDeckEvent?: ((event: DeckPreviewEvent) => void) | undefined;
}

export async function executeCreatePresentationTool(
  input: CreatePresentationToolInput,
  opts: ExecuteCreatePresentationOptions = {},
): Promise<SlideRuntimePresentationResult> {
  const runId = uuidv7();
  const startTime = Date.now();

  logger.info({
    component: 'create-presentation-tool',
    runId,
    step: 'create_presentation_start',
    language: input.language,
    diagnostics: input.diagnostics ?? envDiagnostics,
    revision: input.revision ?? envRevision,
  });

  // Coarse phase progress (Epic #425) — surfaced via the same onDeckEvent sink
  // (#420/#421 transport) so the UI shows movement during the long authoring wait,
  // before any slide compose event can exist. Best-effort; never breaks the PPTX.
  const emitPhase = (phase: DeckPhase, detail?: string): void => {
    try {
      opts.onDeckEvent?.({
        type: 'deck_preview_phase',
        phase,
        ...(detail ? { detail } : {}),
      });
    } catch {
      // phase events are advisory only
    }
  };
  emitPhase('planning');

  const styleGuide = input.styleGuide
    ? `${input.styleGuide}\n\n${FONT_POLICY_STYLE_GUIDE}`
    : FONT_POLICY_STYLE_GUIDE;

  const toolInput: CreatePresentationToolInput = {
    prompt: input.prompt,
    language: input.language,
    traceId: input.traceId,
    styleGuide,
    outputDir: input.outputDir ?? envOutputDir,
    diagnostics: input.diagnostics ?? envDiagnostics,
    revision: input.revision ?? envRevision,
    timeoutMs: input.timeoutMs,
    brandFrameId: envBrandFrameEnabled
      ? (input.brandFrameId ?? envDefaultBrandFrameId)
      : undefined,
    icons: {
      enabled: envIconsEnabled,
      providerId: envIconProvider as 'lucide-local',
    },
    images: {
      retrievalEnabled: envImageRetrievalEnabled,
      generationEnabled: envImageGenerationEnabled,
    },
  };

  try {
    emitPhase('authoring');
    const result = await createPresentation(toolInput, { llm: llmClient });
    const durationMs = Date.now() - startTime;
    // PPTX authored; the deck preview (export/compose) is the next visible phase.
    emitPhase('composing');

    if (result.success) {
      logger.debug({
        component: 'create-presentation-tool',
        runId,
        step: 'create_presentation_paths',
        pptxPath: result.pptxPath,
        contactSheetPath: result.contactSheetPath,
      });

      logger.info({
        component: 'create-presentation-tool',
        runId,
        step: 'create_presentation_done',
        success: true,
        durationMs,
        diagnosticsStatus: result.diagnosticsStatus,
        revisionAttempted: result.revisionAttempted,
        revisionSucceeded: result.revisionSucceeded,
        revisionReason: result.revisionReason,
        artifactCount: result.artifacts?.length ?? 0,
        warningCount: result.warnings?.length ?? 0,
        imageRetrievedCount: result.images?.retrievedCount ?? 0,
        imageGeneratedCount: result.images?.generatedCount ?? 0,
        imageAssetCount:
          result.artifacts?.filter((a) => a.kind === 'image-asset').length ?? 0,
        imageWarnings: result.images?.warnings,
      });

      // --- Artifact upload ---
      let uploadedArtifacts: UploadedPresentationArtifact[] | undefined;
      let pptxDownloadUrl: string | undefined;
      let contactSheetDownloadUrl: string | undefined;
      const uploadWarnings: string[] = [];

      if (envBucketName && s3Client) {
        try {
          const uploadResult = await uploadPresentationArtifacts(
            {
              result,
              bucketName: envBucketName,
              prefix: envPrefix,
              runId,
              includePresignedUrls: envPresignedUrls,
              presignedUrlExpiresSeconds: envUrlExpires,
            },
            { s3Client },
          );

          uploadedArtifacts = uploadResult.uploadedArtifacts;
          uploadWarnings.push(...uploadResult.warnings);

          pptxDownloadUrl = uploadedArtifacts.find(
            (a) => a.kind === 'pptx' && a.downloadUrl,
          )?.downloadUrl;
          contactSheetDownloadUrl = uploadedArtifacts.find(
            (a) => a.kind === 'contact-sheet' && a.downloadUrl,
          )?.downloadUrl;
        } catch (uploadErr) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          uploadWarnings.push(`Artifact upload failed: ${msg}`);
          logger.error({
            component: 'create-presentation-tool',
            runId,
            step: 'artifact_upload_error',
            error: msg,
          });
        }
      } else {
        uploadWarnings.push(
          'PRESENTATION_ARTIFACT_BUCKET_NAME is not set; artifacts were not uploaded.',
        );
      }

      // --- Deck Live Preview (opt-in, degrades — never blocks the PPTX) ---
      let deck: DeckResult | undefined;
      if (envDeckPreviewEnabled && envBucketName && s3Client && result.pptxPath) {
        try {
          // Stable across the streaming attempt and any batch fallback so the
          // emitted events and the attached deck share one identity.
          const deckId = uuidv7();
          const deckName = deriveDeckName(input.prompt);
          const deckLanguage = input.language ?? 'ja';
          // Record the real deck-build timeline (Epic #403/#419). With streaming
          // these fire in real time per slide; the router relays them as
          // deck_progress, otherwise it replays the completed deck.
          const onDeckEvent = (event: DeckPreviewEvent): void => {
            logger.info({
              component: 'create-presentation-tool',
              runId,
              step: 'deck_preview_event',
              deckEventType: event.type,
              ...('index' in event ? { slideIndex: event.index } : {}),
              ...('totalSlides' in event ? { totalSlides: event.totalSlides } : {}),
            });
            // Forward to the streaming handler's sink (Epic #420), if any.
            try {
              opts.onDeckEvent?.(event);
            } catch {
              // a throwing sink must never break PPTX generation
            }
          };
          const previewInput = {
            pptxPath: result.pptxPath,
            workDir: result.workDir,
            deckId,
            name: deckName,
            language: deckLanguage,
            bucketName: envBucketName,
            presignExpiresSeconds: envUrlExpires,
          };

          // Race against a hard budget: a slow-but-succeeding deck preview must
          // not push the whole invocation past the runtime cap and lose the PPTX.
          // Per-slide (#419) is opt-in and self-degrades to the batch pipeline.
          const previewPromise: Promise<{
            deck?: DeckResult | undefined;
            warnings: string[];
          }> = envDeckPreviewStreaming
            ? generateDeckPreviewStreaming(previewInput, { s3Client, onDeckEvent }).then(
                async (streamed) => {
                  if (streamed.streamed && streamed.deck) return streamed;
                  // No slide produced — fall back to the batch pipeline.
                  const batch = await generateDeckPreview(previewInput, {
                    s3Client,
                    onDeckEvent,
                  });
                  return {
                    deck: batch.deck,
                    warnings: [...streamed.warnings, ...batch.warnings],
                  };
                },
              )
            : generateDeckPreview(previewInput, { s3Client, onDeckEvent });
          const budget = new Promise<'timeout'>((resolve) => {
            setTimeout(() => resolve('timeout'), envDeckPreviewBudgetMs).unref?.();
          });
          const outcome = await Promise.race([previewPromise, budget]);

          if (outcome === 'timeout') {
            uploadWarnings.push(
              `Deck preview dropped: exceeded ${envDeckPreviewBudgetMs}ms budget`,
            );
            logger.warn({
              component: 'create-presentation-tool',
              runId,
              step: 'deck_preview_timeout',
              budgetMs: envDeckPreviewBudgetMs,
            });
          } else {
            deck = outcome.deck;
            uploadWarnings.push(...outcome.warnings);
            logger.info({
              component: 'create-presentation-tool',
              runId,
              step: 'deck_preview_done',
              hasDeck: Boolean(deck),
              slideCount: deck?.slides.length ?? 0,
            });
          }
        } catch (deckErr) {
          const msg = deckErr instanceof Error ? deckErr.message : String(deckErr);
          uploadWarnings.push(`Deck preview failed: ${msg}`);
          logger.error({
            component: 'create-presentation-tool',
            runId,
            step: 'deck_preview_error',
            error: msg,
          });
        }
      }

      return {
        ...result,
        warnings: [...result.warnings, ...uploadWarnings],
        uploadedArtifacts: uploadedArtifacts
          ? filterUserFacingArtifacts(uploadedArtifacts)
          : undefined,
        pptxDownloadUrl,
        contactSheetDownloadUrl,
        deck,
      };
    }

    logger.error({
      component: 'create-presentation-tool',
      runId,
      step: 'create_presentation_failed',
      success: false,
      durationMs,
      phase: result.error?.phase,
      message: result.error?.message,
    });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);

    logger.error({
      component: 'create-presentation-tool',
      runId,
      step: 'create_presentation_unhandled_error',
      success: false,
      durationMs,
      error: message,
    });

    return {
      success: false,
      summary:
        'Presentation creation failed during an unknown error. No PPTX artifact was produced.',
      workDir: '',
      artifacts: [],
      warnings: [],
      error: {
        message,
        phase: 'unknown',
      },
    };
  }
}

const createPresentationTool = tool({
  name: 'create_presentation',
  description:
    'Create an editable PowerPoint presentation from a user request using a PptxGenJS authoring workflow. Returns artifact paths for the PPTX, source JS, rendered slides, and contact sheet when available.',
  inputSchema: z.object({
    prompt: z.string().describe('What to create in the presentation.'),
    language: z
      .enum(['ja', 'en'])
      .optional()
      .describe('Output language. Inferred from prompt if omitted.'),
    styleGuide: z
      .string()
      .optional()
      .describe('Optional style guide text (plain text or markdown).'),
    outputDir: z
      .string()
      .optional()
      .describe('Optional output directory for generated artifacts.'),
    diagnostics: z.boolean().optional().describe('Enable diagnostics. Default: true.'),
    revision: z
      .boolean()
      .optional()
      .describe('Enable one revision attempt. Default: true.'),
    timeoutMs: z
      .number()
      .optional()
      .describe('Script execution timeout in milliseconds.'),
    brandFrameId: z
      .string()
      .optional()
      .describe(
        'Optional BrandFrame template ID. Defaults to company-basic-v1 when enabled.',
      ),
  }),
  callback: async (input) => {
    const result = await executeCreatePresentationTool(input);

    return {
      status: result.success ? ('success' as const) : ('error' as const),
      content: [{ text: JSON.stringify(result) }],
    };
  },
});

export { createPresentationTool };
