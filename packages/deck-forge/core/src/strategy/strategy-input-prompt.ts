/**
 * LLM StrategyInput prompt builder and response validation.
 *
 * Builds a JSON-serializable prompt for LLM-based StrategyInput generation.
 * Does NOT make actual LLM API calls.
 */

import type { ResolvedSlideIntent } from "#src/strategy/slide-intent.js";
import type { StrategySelection } from "#src/strategy/strategy-selector.js";
import type { StrategyManifest } from "#src/strategy/manifest.js";
import { getStrategyInputJsonSchema } from "#src/strategy/strategy-input-json-schema.js";
import {
  validateStrategyInput,
  type StrategyInputValidationResult,
} from "#src/strategy/strategy-input-validation.js";

export interface StrategyInputPrompt {
  slideIntent: {
    keyMessage: string;
    audience: string;
    genre: string;
    intent: string;
    contentKinds: string[];
    density: string;
    constraints?: unknown;
  };
  selectedStrategy: {
    id: string;
    name: string;
    description: string;
    inputJsonSchema: unknown;
    limits?: unknown;
  };
  sourceContent?: unknown;
  instruction: string;
}

/**
 * Builds a prompt for LLM-based StrategyInput generation.
 */
export function buildStrategyInputPrompt(input: {
  slideIntent: ResolvedSlideIntent;
  selection: StrategySelection;
  manifest: StrategyManifest;
  sourceContent?: unknown;
}): StrategyInputPrompt {
  const { slideIntent, selection, manifest, sourceContent } = input;

  // Use proper JSON Schema conversion (not raw Zod)
  const jsonSchema = getStrategyInputJsonSchema(selection.strategyId) ?? null;

  return {
    slideIntent: {
      keyMessage: slideIntent.keyMessage,
      audience: slideIntent.audience,
      genre: slideIntent.genre,
      intent: slideIntent.intent,
      contentKinds: [...slideIntent.contentKinds],
      density: slideIntent.density,
      constraints: slideIntent.constraints,
    },
    selectedStrategy: {
      id: selection.strategyId,
      name: manifest.name,
      description: manifest.description,
      inputJsonSchema: jsonSchema,
      limits: manifest.limits,
    },
    sourceContent,
    instruction: [
      "Generate only the semantic input object for the selected strategy.",
      "Do not include coordinates, shapes, colors, font sizes, or PowerPoint-specific rendering instructions.",
      "Follow the provided inputJsonSchema exactly.",
      "Return JSON only.",
    ].join("\n"),
  };
}

/**
 * Validates an LLM-generated StrategyInput response.
 * Delegates to validateStrategyInput().
 */
export function validateLlmStrategyInputResponse(input: {
  strategyId: string;
  response: unknown;
}): StrategyInputValidationResult {
  return validateStrategyInput({
    strategyId: input.strategyId,
    value: input.response,
  });
}
