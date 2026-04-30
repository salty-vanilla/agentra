import type {
  LocalPresentationRuntimeOptions,
  SlideDesigner,
  VisualReviewer,
} from '@deck-forge/core';
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
import { setSlideDesigner, setVisualReviewer } from '@deck-forge/tools';
import { createBedrockSlideDesigner } from './slide-designer-bedrock.js';
import { createBedrockVisualReviewer } from './visual-reviewer-bedrock.js';

export type CreateDeckForgeRunnerOptions = {
  revisionPolicy: NonNullable<DeckForgeRunnerOptions['revisionPolicy']>;
  reviewTrigger?: DeckForgeRunnerOptions['reviewTrigger'];
  renderSlideImages?: boolean;
  intentParser: IntentParser;
  reviewer?: PresentationReviewer;
  operationPlanner?: PresentationOperationPlanner;
};

let sharedRuntime: ReturnType<typeof createLocalRuntime> | undefined;
let sharedDesigner: SlideDesigner | undefined;
let sharedVisualReviewer: VisualReviewer | undefined;
let sharedSlideImageRenderer: HtmlSlideImageRenderer | undefined;
let globalRegistrationDone = false;

/**
 * Lazily create (and cache) the Bedrock-backed `SlideDesigner` /
 * `VisualReviewer` plus a shared `HtmlSlideImageRenderer`. They are also
 * registered as the global tools-package implementations so that the new
 * 0.3.0 MCP tools (`presentation_design_pass` / `presentation_visual_review`)
 * resolve to the same instances when invoked outside the local runtime.
 */
export function getSharedDesigner(): SlideDesigner {
  if (!sharedDesigner) {
    sharedDesigner = createBedrockSlideDesigner();
  }
  ensureGlobalRegistration();
  return sharedDesigner;
}

export function getSharedVisualReviewer(): VisualReviewer {
  if (!sharedVisualReviewer) {
    sharedVisualReviewer = createBedrockVisualReviewer();
  }
  ensureGlobalRegistration();
  return sharedVisualReviewer;
}

export function getSharedSlideImageRenderer(): HtmlSlideImageRenderer {
  if (!sharedSlideImageRenderer) {
    sharedSlideImageRenderer = new HtmlSlideImageRenderer();
  }
  return sharedSlideImageRenderer;
}

function ensureGlobalRegistration(): void {
  if (globalRegistrationDone) return;
  if (sharedDesigner) {
    setSlideDesigner(sharedDesigner);
  }
  if (sharedVisualReviewer) {
    setVisualReviewer(sharedVisualReviewer);
  }
  globalRegistrationDone = true;
}

export function getOrCreateRuntime(): ReturnType<typeof createLocalRuntime> {
  if (sharedRuntime) {
    return sharedRuntime;
  }

  const overrides: Partial<LocalPresentationRuntimeOptions> = {
    imageGenerators: buildImageGenerators(),
    safety: { allowOutsideWorkspace: true },
    slideImageRenderer: getSharedSlideImageRenderer(),
    designer: getSharedDesigner(),
    visualReviewer: getSharedVisualReviewer(),
  };

  sharedRuntime = createLocalRuntime(overrides);
  return sharedRuntime;
}

export function createDeckForgeRunner(
  options: CreateDeckForgeRunnerOptions,
): DeckForgeRunner {
  const runtime = getOrCreateRuntime();

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
