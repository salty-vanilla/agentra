import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DeckForgeRunInput } from '@deck-forge/runner';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { publishArtifactIfNeeded } from './artifact.js';
import { createDeckForgeRunner } from './create-runner.js';
import { createBedrockIntentParser } from './intent-parser-bedrock.js';
import { buildLoggerOptions, getLogger } from './logging.js';
import { createBedrockOperationPlanner } from './operation-planner-bedrock.js';
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

          const intentParser = createBedrockIntentParser();
          const useAiReview = request.revisionPolicy === 'ai_review';

          const runner = createDeckForgeRunner({
            revisionPolicy: request.revisionPolicy,
            reviewTrigger: request.reviewTrigger,
            renderSlideImages: request.renderSlideImages,
            intentParser,
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
            logDeckForgeEvent('failed', {
              runId,
              traceId: request.traceId,
              finalStatus: result.finalStatus,
              errors: result.errors,
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
              },
            };
            return;
          }

          const artifact = await publishArtifactIfNeeded({
            presentation:
              result.finalStatus === 'success'
                ? result.artifacts.presentation
                : undefined,
            outputPath,
            runId,
            format: request.exportFormat,
          });

          logDeckForgeEvent('success', {
            runId,
            traceId: request.traceId,
            finalStatus: result.finalStatus,
            artifactExists: artifact?.exists,
            s3Uri: artifact?.s3Uri,
            durationMs: Date.now() - startedAt,
          });

          yield {
            event: 'message',
            data: {
              type: 'deck_forge_result',
              runId,
              result,
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
