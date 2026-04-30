import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PresentationIR } from '@deck-forge/core';
import type { DeckForgeRunInput } from '@deck-forge/runner';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { materializeAndExportPptx, publishArtifactIfNeeded } from './artifact.js';
import { createDeckForgeRunner } from './create-runner.js';
import {
  buildStructuredIntent,
  createStaticIntentParser,
  runCreatePipeline,
} from './intent-parser-bedrock.js';
import { buildLoggerOptions, getLogger } from './logging.js';
import { createBedrockOperationPlanner } from './operation-planner-bedrock.js';
import { renderPptxToPngs } from './pptx-renderer.js';
import { createBedrockReviewer } from './reviewer-bedrock.js';
import { reviseSlideSpecs } from './revise-slide-specs.js';
import { bootstrapDeckForgeRuntimeEnv } from './runtime-env.js';
import { DeckForgeRequestSchema } from './schemas.js';
import { reviewSlidesWithVision, type VisionReviewReport } from './vision-reviewer.js';

type DeckForgeRunInputWithImageProvider = DeckForgeRunInput & {
  imageProvider?: 'pexels' | 'unsplash' | 'pixabay';
};

function logDeckForgeEvent(message: string, data: Record<string, unknown>) {
  getLogger().info(data, `[deck-forge-runtime] ${message}`);
}

async function main() {
  await bootstrapDeckForgeRuntimeEnv();

  const app = new BedrockAgentCoreApp({
    invocationHandler: {
      requestSchema: DeckForgeRequestSchema,

      process: async function* (request) {
        const runId = request.traceId ?? uuidv7();
        const startedAt = Date.now();

        try {
          if (request.mode === 'modify') {
            logDeckForgeEvent('unsupported-mode', {
              runId,
              traceId: request.traceId,
              mode: request.mode,
            });
            yield {
              event: 'message',
              data: {
                type: 'deck_forge_error',
                runId,
                error: 'Deck Forge modify mode is not supported by this runtime yet.',
              },
            };
            return;
          }

          const outputPath =
            request.exportFormat === 'pptx'
              ? `/tmp/deck-forge/${runId}/deck.pptx`
              : undefined;

          if (outputPath) {
            await mkdir(dirname(outputPath), { recursive: true });
          }

          // Run the create pipeline ourselves so we get the brief / deckPlan /
          // slideSpecs intermediates needed for the vision-revision loop. The
          // runner is then driven by a static parser that returns the same
          // StructuredIntent without re-calling Bedrock.
          const wantVisionReview = request.visionReview || request.visionRevision;
          const pipeline = await runCreatePipeline(request.goal);
          const useAiReview = request.revisionPolicy === 'ai_review';

          const buildRunner = (intent: typeof pipeline.intent) =>
            createDeckForgeRunner({
              revisionPolicy: request.revisionPolicy,
              reviewTrigger: request.reviewTrigger,
              renderSlideImages: request.renderSlideImages,
              intentParser: createStaticIntentParser(intent),
              ...(useAiReview
                ? {
                    reviewer: createBedrockReviewer(),
                    operationPlanner: createBedrockOperationPlanner(),
                  }
                : {}),
            });

          const runInput: DeckForgeRunInputWithImageProvider = {
            goal: request.goal,
            mode: request.mode,
            exportFormat: request.exportFormat === 'pptx' ? 'json' : request.exportFormat,
            validationLevel: request.validationLevel,
            acquisitionMode: request.acquisitionMode,
            imageProvider: request.imageProvider,
            autoFix: request.autoFix,
            includeTrace: request.includeTrace,
          };

          if (request.presentation !== undefined) {
            runInput.presentation = request.presentation;
          }
          if (request.operations !== undefined) {
            runInput.operations = request.operations;
          }

          const result = await buildRunner(pipeline.intent).run(runInput);
          if (result.finalStatus !== 'success') {
            // Persist a failure bundle so we can debug after the fact.
            const failureArtifact = await publishArtifactIfNeeded({
              presentation: undefined,
              outputPath: undefined,
              runId,
              format: request.exportFormat,
              request,
              result,
            });

            logDeckForgeEvent('failed', {
              runId,
              traceId: request.traceId,
              finalStatus: result.finalStatus,
              errors: result.errors,
              bundleS3Uri: failureArtifact?.bundleS3Uri,
              durationMs: Date.now() - startedAt,
            });

            yield {
              event: 'message',
              data: {
                type: 'deck_forge_error',
                runId,
                error:
                  result.errors
                    .map((error) => error.message)
                    .filter(Boolean)
                    .join('\n') || 'Deck Forge failed without a detailed error.',
                artifact: failureArtifact,
              },
            };
            return;
          }

          // ----- Vision review + (optional) revision loop ----------------
          let finalResult: typeof result = result;
          let finalPresentation: PresentationIR | undefined =
            result.artifacts.presentation;
          let visionReview: VisionReviewReport | undefined;
          let v1Archive:
            | { presentation?: PresentationIR; pptxLocalPath?: string }
            | undefined;

          if (
            wantVisionReview &&
            outputPath &&
            request.exportFormat === 'pptx' &&
            finalPresentation
          ) {
            try {
              // Export v1 pptx first so we can rasterize it.
              const v1OutputPath = `/tmp/deck-forge/${runId}/v1/deck.pptx`;
              const v1Export = await materializeAndExportPptx({
                presentation: finalPresentation,
                outputPath: v1OutputPath,
              });

              if (!v1Export.exists) {
                logDeckForgeEvent('vision-review-skipped', {
                  runId,
                  reason: 'v1 pptx export did not produce a file',
                });
              } else {
                const slides = await renderPptxToPngs({ pptxPath: v1OutputPath });
                visionReview = await reviewSlidesWithVision({
                  slides,
                  slideSpecs: pipeline.slideSpecs,
                  brief: pipeline.brief,
                });
                logDeckForgeEvent('vision-review-complete', {
                  runId,
                  slideCount: visionReview.slideCount,
                  averageScore: visionReview.averageScore,
                  slidesNeedingRevision: visionReview.slidesNeedingRevision,
                });

                if (request.visionRevision && visionReview.slidesNeedingRevision > 0) {
                  const { slideSpecs: revisedSpecs, revisedCount } =
                    await reviseSlideSpecs({
                      slideSpecs: pipeline.slideSpecs,
                      review: visionReview,
                      brief: pipeline.brief,
                    });

                  if (revisedCount > 0) {
                    const revisedIntent = buildStructuredIntent({
                      brief: pipeline.brief,
                      deckPlan: pipeline.deckPlan,
                      slideSpecs: revisedSpecs,
                      assetSpecs: pipeline.assetSpecs,
                      userRequest: request.goal,
                      language: (pipeline.brief.output?.language as 'ja' | 'en') ?? 'en',
                    });
                    const result2 = await buildRunner(revisedIntent).run(runInput);
                    if (result2.finalStatus === 'success') {
                      // v1 (pre-revision) becomes the archive; v2 takes over as primary.
                      v1Archive = {
                        presentation: finalPresentation,
                        pptxLocalPath: v1OutputPath,
                      };
                      finalResult = result2;
                      finalPresentation = result2.artifacts.presentation;
                      logDeckForgeEvent('vision-revision-applied', {
                        runId,
                        revisedCount,
                      });
                    } else {
                      logDeckForgeEvent('vision-revision-failed', {
                        runId,
                        errors: result2.errors,
                      });
                    }
                  } else {
                    logDeckForgeEvent('vision-revision-skipped', {
                      runId,
                      reason: 'no slide specs were successfully revised',
                    });
                  }
                }
              }
            } catch (error) {
              logDeckForgeEvent('vision-review-error', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          // ---------------------------------------------------------------

          const artifact = await publishArtifactIfNeeded({
            presentation: finalPresentation,
            outputPath,
            runId,
            format: request.exportFormat,
            request,
            result: finalResult,
            ...(visionReview !== undefined ? { visionReview } : {}),
            ...(v1Archive !== undefined ? { v1Archive } : {}),
          });

          logDeckForgeEvent('success', {
            runId,
            traceId: request.traceId,
            finalStatus: finalResult.finalStatus,
            artifactExists: artifact?.exists,
            s3Uri: artifact?.s3Uri,
            bundleS3Uri: artifact?.bundleS3Uri,
            irS3Uri: artifact?.irS3Uri,
            visionReviewS3Uri: artifact?.visionReviewS3Uri,
            v1DeckS3Uri: artifact?.v1DeckS3Uri,
            assetCount: artifact?.assetCount,
            durationMs: Date.now() - startedAt,
          });

          yield {
            event: 'message',
            data: {
              type: 'deck_forge_result',
              runId,
              result: finalResult,
              artifact,
            },
          };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          logDeckForgeEvent('unhandled-error', {
            runId,
            traceId: request.traceId,
            error: errorMessage,
            stack: errorStack,
            durationMs: Date.now() - startedAt,
          });
          yield {
            event: 'message',
            data: {
              type: 'deck_forge_error',
              runId,
              error: errorMessage,
            },
          };
        }
      },
    },
    config: {
      logging: {
        options: buildLoggerOptions(),
      },
    },
  });

  await app.run();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
