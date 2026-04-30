import type { LocalPresentationRuntimeOptions } from '@deck-forge/core';
import {
  BedrockImageGenerator,
  createLocalRuntime,
  HtmlSlideImageRenderer,
  LocalFileImageGenerator,
} from '@deck-forge/core';
import type { DeckForgeRunnerOptions } from '@deck-forge/runner';
import { DeckForgeRunner } from '@deck-forge/runner';
import type {
  IntentParser,
  PresentationOperationPlanner,
  PresentationReviewer,
} from '@deck-forge/tools';

export type CreateDeckForgeRunnerOptions = {
  revisionPolicy: NonNullable<DeckForgeRunnerOptions['revisionPolicy']>;
  reviewTrigger?: DeckForgeRunnerOptions['reviewTrigger'];
  renderSlideImages?: boolean;
  intentParser: IntentParser;
  reviewer?: PresentationReviewer;
  operationPlanner?: PresentationOperationPlanner;
};

let sharedRuntime: ReturnType<typeof createLocalRuntime> | undefined;

export function getOrCreateRuntime(options?: {
  renderSlideImages?: boolean;
}): ReturnType<typeof createLocalRuntime> {
  if (sharedRuntime) {
    return sharedRuntime;
  }

  const overrides: Partial<LocalPresentationRuntimeOptions> = {
    imageGenerators: buildImageGenerators(),
    safety: { allowOutsideWorkspace: true },
  };

  if (options?.renderSlideImages === true) {
    overrides.slideImageRenderer = new HtmlSlideImageRenderer();
  }

  sharedRuntime = createLocalRuntime(overrides);
  return sharedRuntime;
}

export function createDeckForgeRunner(
  options: CreateDeckForgeRunnerOptions,
): DeckForgeRunner {
  const runtime = getOrCreateRuntime(
    options.renderSlideImages != null
      ? { renderSlideImages: options.renderSlideImages }
      : undefined,
  );

  const runnerOptions: DeckForgeRunnerOptions = {
    runtime,
    intentParser: options.intentParser,
    revisionPolicy: options.revisionPolicy,
  };

  if (options.reviewTrigger != null) {
    runnerOptions.reviewTrigger = options.reviewTrigger;
  }
  if (options.reviewer != null) {
    runnerOptions.reviewer = options.reviewer;
  }
  if (options.operationPlanner != null) {
    runnerOptions.operationPlanner = options.operationPlanner;
  }

  return new DeckForgeRunner(runnerOptions);
}

function buildImageGenerators() {
  const region = process.env.AWS_REGION?.trim() || process.env.BEDROCK_REGION?.trim();
  const modelId = process.env.DECK_FORGE_BEDROCK_IMAGE_MODEL_ID?.trim() || undefined;

  if (region) {
    const bedrockOptions = modelId ? { region, modelId } : { region };
    return [new BedrockImageGenerator(bedrockOptions), new LocalFileImageGenerator()];
  }

  return [new LocalFileImageGenerator()];
}

export { buildImageGenerators };
