/**
 * Phase 8J: Bedrock-backed LLM StrategyInput generator.
 *
 * Uses Bedrock tool_use to produce StrategyInput for each slide.
 * Falls back to deterministic generator on failure.
 */

import type {
  LlmStrategyInputGenerationRequest,
  LlmStrategyInputGenerationResult,
} from '@deck-forge/core';
import {
  buildLlmStrategyInputSystemPrompt,
  buildLlmStrategyInputUserMessage,
} from '@deck-forge/core';
import { invokeBedrockToolUse } from './bedrock-client.js';
import { getLogger } from './logging.js';

const log = getLogger();

function resolveStrategyInputModelId(): string {
  return (
    process.env.DECK_FORGE_STRATEGY_INPUT_MODEL_ID?.trim() ||
    process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID?.trim() ||
    'global.anthropic.claude-sonnet-4-6'
  );
}

/**
 * Creates a Bedrock-backed LLM StrategyInput generation function.
 *
 * This function is passed to LlmFirstStrategyInputGenerator as the
 * `llmGenerateFn` parameter.
 */
export function createBedrockStrategyInputGenerateFn() {
  return async function bedrockStrategyInputGenerate(
    request: LlmStrategyInputGenerationRequest,
  ): Promise<LlmStrategyInputGenerationResult> {
    const warnings: string[] = [];

    const promptInput: Parameters<typeof buildLlmStrategyInputSystemPrompt>[0] = {
      slideIntent: request.slideIntent,
      selection: request.selection,
      manifest: request.manifest,
      inputJsonSchema: request.inputJsonSchema,
      slideIndex: request.slideIndex,
      slideCount: request.slideCount,
      sourceContent: request.sourceContent,
    };
    if (request.language) promptInput.language = request.language;
    if (request.audience) promptInput.audience = request.audience;

    const system = buildLlmStrategyInputSystemPrompt(promptInput);

    const userMessage = buildLlmStrategyInputUserMessage({
      slideIntent: request.slideIntent,
      sourceContent: request.sourceContent,
    });

    const toolName = 'generate_strategy_input';
    const toolDescription =
      'Generate the semantic input JSON for the given strategy. Return only the input object.';

    // Build a tool schema from the provided inputJsonSchema
    const inputSchema =
      request.inputJsonSchema && typeof request.inputJsonSchema === 'object'
        ? (request.inputJsonSchema as Record<string, unknown>)
        : {
            type: 'object' as const,
            properties: {},
            additionalProperties: true,
          };

    const result = await invokeBedrockToolUse<Record<string, unknown>>({
      system,
      userMessage,
      tool: {
        name: toolName,
        description: toolDescription,
        input_schema: inputSchema,
      },
      maxTokens: 4096,
      modelId: resolveStrategyInputModelId(),
    });

    log.info(
      {
        slideIndex: request.slideIndex,
        strategyId: request.selection.strategyId,
        resultKeys: result ? Object.keys(result) : [],
      },
      '[deck-forge-runtime] [strategy-input-bedrock] generated',
    );

    return {
      strategyInput: result,
      source: 'llm',
      warnings,
    };
  };
}
