import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PresentationIR } from '@deck-forge/core';
import {
  analyzeDeckStabilization,
  type DeckStabilizationDiagnostics,
  runDesignReviewLoop,
} from '@deck-forge/core';
import type { DeckForgeRunInput } from '@deck-forge/runner';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { materializeAndExportPptx, publishArtifactIfNeeded } from './artifact.js';
import {
  createDeckForgeRunner,
  getOrCreateRuntime,
  getSharedDesigner,
  getSharedSlideImageRenderer,
  getSharedVisualReviewer,
} from './create-runner.js';
import { createStaticIntentParser, runCreatePipeline } from './intent-parser-bedrock.js';
import { buildLoggerOptions, getLogger } from './logging.js';
import { createBedrockOperationPlanner } from './operation-planner-bedrock.js';
import { renderPptxToPngs } from './pptx-renderer.js';
import { createBedrockReviewer } from './reviewer-bedrock.js';
import { bootstrapDeckForgeRuntimeEnv } from './runtime-env.js';
import { DeckForgeRequestSchema } from './schemas.js';

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
          // slideSpecs intermediates needed for downstream design + review.
          const pipeline = await runCreatePipeline(request.goal);
          const useAiReview = request.revisionPolicy === 'ai_review';

          const runner = createDeckForgeRunner({
            revisionPolicy: request.revisionPolicy,
            reviewTrigger: request.reviewTrigger,
            renderSlideImages: request.renderSlideImages,
            intentParser: createStaticIntentParser(pipeline.intent),
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

          const result = await runner.run(runInput);
          if (result.finalStatus !== 'success') {
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

          // ----- Design pass + design-review loop ----------------------
          const finalResult: typeof result = result;
          let finalPresentation: PresentationIR | undefined =
            result.artifacts.presentation;
          const initialPresentation = finalPresentation;
          let designReviewTrace: unknown;
          let v1Archive:
            | { presentation?: PresentationIR; pptxLocalPath?: string }
            | undefined;
          let visionReview: unknown;

          // ----- V1 diagnostics (before design-review loop) -----------
          if (initialPresentation) {
            try {
              const v1Diag = analyzeDeckStabilization({
                presentation: initialPresentation,
              });
              logDeckForgeEvent('diagnostics', {
                runId,
                diagnosticsPhase: 'v1',
                slideCount: v1Diag.layout.slideCount,
                layoutStatus: v1Diag.layout.deployReadiness.status,
                stabilizationStatus: v1Diag.status,
                stabilizationScore: v1Diag.score,
                totalOperations: v1Diag.operations.totalOperations,
                layoutRepairRatio: v1Diag.operations.layoutRepairRatio,
                visualPolishRatio: v1Diag.operations.visualPolishRatio,
                contentRewriteRatio: v1Diag.operations.contentRewriteRatio,
                slidesWithFallbackSlots: v1Diag.layout.slidesWithFallbackSlots,
                slidesWithOverlaps: v1Diag.layout.slidesWithOverlaps,
                totalOutOfBoundsCount: v1Diag.layout.totalOutOfBoundsCount,
                operationsWithoutSlideId: v1Diag.operations.operationsWithoutSlideId,
                topSlidesByOperations: v1Diag.operations.topSlidesByOperations.slice(
                  0,
                  5,
                ),
                hotspotSlides: v1Diag.hotspots
                  .filter((h) => h.severity !== 'info')
                  .slice(0, 3)
                  .map((h) => ({
                    slideId: h.slideId,
                    slideIndex: h.slideIndex,
                    severity: h.severity,
                    overlapCount: h.overlapCount,
                    layoutRepairOps: h.layoutRepairOperationCount,
                    layoutStrategyId: h.layoutStrategyId,
                    reasons: h.reasons,
                  })),
                recommendationCodes: v1Diag.recommendations.map((r) => r.code),
              });
            } catch (error) {
              logDeckForgeEvent('diagnostics-failed', {
                runId,
                diagnosticsPhase: 'v1',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          // -----------------------------------------------------------

          // Single Bedrock SlideDesigner pass over the freshly built IR.
          if (request.designPass && finalPresentation) {
            try {
              const runtime = getOrCreateRuntime();
              const pass = await runtime.runDesignPass(finalPresentation);
              finalPresentation = pass.presentation;
              logDeckForgeEvent('design-pass-applied', {
                runId,
                operationCount: pass.operations.length,
                rationaleCount: pass.rationales.length,
              });
            } catch (error) {
              logDeckForgeEvent('design-pass-failed', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // Iterative designer → render → visualReviewer → applyOps loop.
          if (request.designReviewIterations > 0 && finalPresentation) {
            try {
              const beforeLoopIr = finalPresentation;
              const loop = await runDesignReviewLoop({
                presentation: finalPresentation,
                designer: getSharedDesigner(),
                visualReviewer: getSharedVisualReviewer(),
                renderer: getSharedSlideImageRenderer(),
                maxIterations: request.designReviewIterations,
                ...(request.exportFormat === 'pptx' &&
                request.validationLevel === 'export'
                  ? {
                      validateFinal: (presentation, options) =>
                        getOrCreateRuntime().validate(presentation, options),
                      finalValidationLevel: 'export' as const,
                    }
                  : {}),
                // Stop early once the reviewer reports no error-severity findings.
                stopWhen: (iter) =>
                  iter.findings.every((f) => f.severity !== 'error') &&
                  iter.operations.length === 0,
              });

              finalPresentation = loop.presentation;

              // Strip slideImages bytes before persisting the trace (they can
              // be megabytes per iteration).
              designReviewTrace = {
                stoppedReason: loop.stoppedReason,
                iterations: loop.iterations.map((iter) => ({
                  iteration: iter.iteration,
                  converged: iter.converged,
                  operationCount: iter.operations.length,
                  operations: iter.operations,
                  findings: iter.findings,
                  designerRationales: iter.designerRationales,
                  slideImageCount: iter.slideImages.length,
                })),
                finalValidationReport: loop.finalValidationReport,
              };

              // Archive the pre-loop IR so the before/after diff is reproducible.
              v1Archive = { presentation: beforeLoopIr };

              logDeckForgeEvent('design-review-loop-complete', {
                runId,
                stoppedReason: loop.stoppedReason,
                iterationCount: loop.iterations.length,
                totalOperations: loop.iterations.reduce(
                  (sum, it) => sum + it.operations.length,
                  0,
                ),
              });
            } catch (error) {
              logDeckForgeEvent('design-review-loop-failed', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // ----- Final stabilization diagnostics --------------------
          let stabilizationDiagnostics: DeckStabilizationDiagnostics | undefined;
          if (finalPresentation) {
            try {
              stabilizationDiagnostics = analyzeDeckStabilization({
                presentation: finalPresentation,
              });
              logDeckForgeEvent('diagnostics', {
                runId,
                diagnosticsPhase: 'final',
                slideCount: stabilizationDiagnostics.layout.slideCount,
                layoutStatus: stabilizationDiagnostics.layout.deployReadiness.status,
                stabilizationStatus: stabilizationDiagnostics.status,
                stabilizationScore: stabilizationDiagnostics.score,
                totalOperations: stabilizationDiagnostics.operations.totalOperations,
                layoutRepairRatio: stabilizationDiagnostics.operations.layoutRepairRatio,
                visualPolishRatio: stabilizationDiagnostics.operations.visualPolishRatio,
                contentRewriteRatio:
                  stabilizationDiagnostics.operations.contentRewriteRatio,
                slidesWithFallbackSlots:
                  stabilizationDiagnostics.layout.slidesWithFallbackSlots,
                slidesWithOverlaps: stabilizationDiagnostics.layout.slidesWithOverlaps,
                totalOutOfBoundsCount:
                  stabilizationDiagnostics.layout.totalOutOfBoundsCount,
                operationsWithoutSlideId:
                  stabilizationDiagnostics.operations.operationsWithoutSlideId,
                topSlidesByOperations:
                  stabilizationDiagnostics.operations.topSlidesByOperations.slice(0, 5),
                hotspotSlides: stabilizationDiagnostics.hotspots
                  .filter((h) => h.severity !== 'info')
                  .slice(0, 3)
                  .map((h) => ({
                    slideId: h.slideId,
                    slideIndex: h.slideIndex,
                    severity: h.severity,
                    overlapCount: h.overlapCount,
                    layoutRepairOps: h.layoutRepairOperationCount,
                    layoutStrategyId: h.layoutStrategyId,
                    reasons: h.reasons,
                  })),
                recommendationCodes: stabilizationDiagnostics.recommendations.map(
                  (r) => r.code,
                ),
              });
            } catch (error) {
              logDeckForgeEvent('diagnostics-failed', {
                runId,
                diagnosticsPhase: 'final',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          // ---------------------------------------------------------

          if (
            request.exportFormat === 'pptx' &&
            request.validationLevel === 'export' &&
            finalPresentation
          ) {
            const exportValidation = await getOrCreateRuntime().validate(
              finalPresentation,
              { level: 'export' },
            );
            if (exportValidation.status === 'failed') {
              const failureArtifact = await publishArtifactIfNeeded({
                presentation: finalPresentation,
                outputPath: undefined,
                runId,
                format: request.exportFormat,
                request,
                result: {
                  ...finalResult,
                  finalStatus: 'failed',
                  validationReport: exportValidation,
                },
                ...(designReviewTrace !== undefined ? { designReviewTrace } : {}),
                ...(v1Archive !== undefined ? { v1Archive } : {}),
              });

              logDeckForgeEvent('export-validation-failed', {
                runId,
                traceId: request.traceId,
                errorCount: exportValidation.summary.errorCount,
                warningCount: exportValidation.summary.warningCount,
                durationMs: Date.now() - startedAt,
              });

              yield {
                event: 'message',
                data: {
                  type: 'deck_forge_error',
                  runId,
                  error:
                    exportValidation.issues
                      .filter((issue) => issue.severity === 'error')
                      .map((issue) => issue.message)
                      .join('\n') || 'Deck Forge export validation failed.',
                  artifact: failureArtifact,
                },
              };
              return;
            }
          }

          // Optional separate vision-review report (no IR mutation). Useful
          // when the caller wants the human-readable critique persisted
          // alongside an export from the *final* IR.
          if (
            request.visionReview &&
            outputPath &&
            request.exportFormat === 'pptx' &&
            finalPresentation
          ) {
            try {
              const reviewExport = await materializeAndExportPptx({
                presentation: finalPresentation,
                outputPath,
              });
              if (reviewExport.exists) {
                const slides = await renderPptxToPngs({ pptxPath: outputPath });
                const reviewer = getSharedVisualReviewer();
                visionReview = await reviewer.review({
                  presentation: finalPresentation,
                  slideImages: slides.map((s, idx) => ({
                    slideId: finalPresentation?.slides[idx]?.id ?? `slide-${idx + 1}`,
                    mimeType: 'image/png',
                    data: new Uint8Array(s.png),
                    source: 'pptx',
                  })),
                });
                logDeckForgeEvent('vision-review-complete', {
                  runId,
                  findingCount: (visionReview as { findings?: unknown[] }).findings
                    ?.length,
                });
              }
            } catch (error) {
              logDeckForgeEvent('vision-review-error', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          // -------------------------------------------------------------

          // Make sure v1 archive captures the pre-loop pptx as well, so
          // before/after pptx pairs are observable from S3.
          if (
            v1Archive &&
            initialPresentation &&
            outputPath &&
            request.exportFormat === 'pptx'
          ) {
            try {
              const v1OutputPath = `/tmp/deck-forge/${runId}/v1/deck.pptx`;
              const v1Export = await materializeAndExportPptx({
                presentation: initialPresentation,
                outputPath: v1OutputPath,
              });
              if (v1Export.exists) {
                v1Archive = {
                  presentation: initialPresentation,
                  pptxLocalPath: v1OutputPath,
                };
              }
            } catch (error) {
              logDeckForgeEvent('v1-archive-export-failed', {
                runId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const artifact = await publishArtifactIfNeeded({
            presentation: finalPresentation,
            outputPath,
            runId,
            format: request.exportFormat,
            request,
            result: finalResult,
            ...(visionReview !== undefined ? { visionReview } : {}),
            ...(designReviewTrace !== undefined ? { designReviewTrace } : {}),
            ...(v1Archive !== undefined ? { v1Archive } : {}),
            ...(stabilizationDiagnostics !== undefined
              ? { stabilizationDiagnostics }
              : {}),
          });

          const qualityStatus = resolveQualityStatus(stabilizationDiagnostics);

          logDeckForgeEvent('success', {
            runId,
            traceId: request.traceId,
            finalStatus: finalResult.finalStatus,
            qualityStatus,
            stabilizationStatus: stabilizationDiagnostics?.status,
            stabilizationScore: stabilizationDiagnostics?.score,
            artifactExists: artifact?.exists,
            s3Uri: artifact?.s3Uri,
            bundleS3Uri: artifact?.bundleS3Uri,
            irS3Uri: artifact?.irS3Uri,
            visionReviewS3Uri: artifact?.visionReviewS3Uri,
            designReviewS3Uri: artifact?.designReviewS3Uri,
            v1DeckS3Uri: artifact?.v1DeckS3Uri,
            stabilizationDiagnosticsS3Uri: artifact?.stabilizationDiagnosticsS3Uri,
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

function resolveQualityStatus(
  diag: DeckStabilizationDiagnostics | undefined,
): 'pass' | 'warning' | 'fail' {
  if (!diag) return 'pass';
  if (diag.layout.deployReadiness.status === 'fail' || diag.status === 'unstable') {
    return 'fail';
  }
  if (
    diag.layout.deployReadiness.status === 'warning' ||
    diag.status === 'needs_attention'
  ) {
    return 'warning';
  }
  return 'pass';
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
