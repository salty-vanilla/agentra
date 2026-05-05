import type { LlmClient, LlmConverseInput } from '@agentra/presentation-author';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger.js';

export interface CreatePresentationAuthorLlmClientOptions {
  modelId?: string | undefined;
  region?: string | undefined;
  maxTokens?: number | undefined;
}

// Anthropic API types for tool_use
interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<AnthropicContentBlock | AnthropicToolResultBlock>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
}

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export function createPresentationAuthorLlmClient(
  options?: CreatePresentationAuthorLlmClientOptions,
): LlmClient {
  const modelId =
    options?.modelId ??
    process.env.PRESENTATION_AUTHOR_MODEL_ID ??
    'global.anthropic.claude-sonnet-4-6';
  const region =
    options?.region ??
    process.env.BEDROCK_REGION ??
    process.env.AWS_REGION ??
    'us-east-1';
  const maxTokens = options?.maxTokens ?? 32768;

  const client = new BedrockRuntimeClient({ region });

  async function invokeModel(
    messages: AnthropicMessage[],
    system: string | undefined,
    tools: AnthropicToolDef[] | undefined,
  ): Promise<AnthropicResponse> {
    const body: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages,
    };
    if (system) {
      body.system = system;
    }
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const response = await client.send(command);
    return JSON.parse(new TextDecoder().decode(response.body)) as AnthropicResponse;
  }

  return {
    converse: async (input: LlmConverseInput): Promise<string> => {
      const startTime = Date.now();
      const hasTools = input.tools && input.tools.length > 0;

      logger.info({
        component: 'llm-adapter',
        step: 'converse_start',
        modelId,
        hasSystem: !!input.system,
        promptLength: input.prompt.length,
        toolCount: input.tools?.length ?? 0,
      });

      // Convert tool definitions to Anthropic format
      const anthropicTools: AnthropicToolDef[] | undefined = input.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));

      const messages: AnthropicMessage[] = [{ role: 'user', content: input.prompt }];

      const maxIterations = input.maxToolIterations ?? 10;
      let iteration = 0;

      while (iteration < maxIterations) {
        iteration++;
        const response = await invokeModel(
          messages,
          input.system,
          hasTools ? anthropicTools : undefined,
        );

        if (response.stop_reason !== 'tool_use' || !input.toolHandlers) {
          // Final response — extract text
          const text = response.content
            .filter((c): c is AnthropicTextBlock => c.type === 'text' && !!c.text)
            .map((c) => c.text)
            .join('');

          const durationMs = Date.now() - startTime;
          logger.info({
            component: 'llm-adapter',
            step: 'converse_done',
            modelId,
            durationMs,
            responseLength: text.length,
            iterations: iteration,
          });

          return text;
        }

        // Tool use — process all tool calls in this response
        const toolUseBlocks = response.content.filter(
          (c): c is AnthropicToolUseBlock => c.type === 'tool_use',
        );

        // Add assistant message with full content (text + tool_use blocks)
        messages.push({ role: 'assistant', content: response.content });

        // Execute tool handlers and build tool_result blocks
        const toolResults: AnthropicToolResultBlock[] = [];
        for (const block of toolUseBlocks) {
          const handler = input.toolHandlers[block.name];
          if (!handler) {
            logger.warn({
              component: 'llm-adapter',
              step: 'tool_handler_missing',
              toolName: block.name,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            });
            continue;
          }

          try {
            logger.info({
              component: 'llm-adapter',
              step: 'tool_call',
              toolName: block.name,
              iteration,
            });
            const result = await handler(block.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            logger.error({
              component: 'llm-adapter',
              step: 'tool_call_error',
              toolName: block.name,
              error: err instanceof Error ? err.message : String(err),
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              }),
            });
          }
        }

        // Add user message with tool results
        messages.push({ role: 'user', content: toolResults });
      }

      // Max iterations reached — extract whatever text we have from last response
      logger.warn({
        component: 'llm-adapter',
        step: 'max_iterations_reached',
        maxIterations,
      });

      // Return empty string as fallback — this shouldn't happen in practice
      return '';
    },
  };
}
