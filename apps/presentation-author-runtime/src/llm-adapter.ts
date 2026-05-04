import type { LlmClient } from '@agentra/presentation-author';
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

export function createPresentationAuthorLlmClient(
  options?: CreatePresentationAuthorLlmClientOptions,
): LlmClient {
  const modelId =
    options?.modelId ??
    process.env.PRESENTATION_AUTHOR_MODEL_ID ??
    'us.anthropic.claude-sonnet-4-6';
  const region = options?.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const maxTokens = options?.maxTokens ?? 16384;

  const client = new BedrockRuntimeClient({ region });

  return {
    generateText: async ({ system, prompt }) => {
      const startTime = Date.now();
      logger.info({
        component: 'llm-adapter',
        step: 'bedrock_invoke_start',
        modelId,
        hasSystem: !!system,
        promptLength: prompt.length,
      });

      const messages: Array<{ role: string; content: string }> = [
        { role: 'user', content: prompt },
      ];

      const body: Record<string, unknown> = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages,
      };
      if (system) {
        body.system = system;
      }

      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
        content: Array<{ type: string; text?: string }>;
      };

      const text = responseBody.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('');

      const durationMs = Date.now() - startTime;
      logger.info({
        component: 'llm-adapter',
        step: 'bedrock_invoke_done',
        modelId,
        durationMs,
        responseLength: text.length,
      });

      return text;
    },
  };
}
