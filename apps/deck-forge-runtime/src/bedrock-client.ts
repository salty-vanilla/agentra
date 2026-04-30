import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

let client: BedrockRuntimeClient | undefined;

function getClient(): BedrockRuntimeClient {
  if (client) {
    return client;
  }
  const region =
    process.env.AWS_REGION?.trim() || process.env.BEDROCK_REGION?.trim() || 'us-east-1';
  client = new BedrockRuntimeClient({ region });
  return client;
}

function resolveTextModelId(): string {
  return (
    process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID?.trim() ||
    'global.anthropic.claude-sonnet-4-6'
  );
}

export async function invokeBedrockText(input: {
  system: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<string> {
  const modelId = resolveTextModelId();
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: input.maxTokens ?? 8192,
    system: input.system,
    messages: [{ role: 'user', content: input.userMessage }],
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await getClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed: { content?: Array<{ type: string; text?: string }> } =
    JSON.parse(decoded);

  const textBlock = parsed.content?.find((block) => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Bedrock response contained no text content.');
  }
  return textBlock.text;
}

type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
};

export async function invokeBedrockToolUse<T>(input: {
  system: string;
  userMessage: string;
  tool: ToolDefinition;
  maxTokens?: number;
}): Promise<T> {
  const modelId = resolveTextModelId();
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: input.maxTokens ?? 16384,
    system: input.system,
    messages: [{ role: 'user', content: input.userMessage }],
    tools: [input.tool],
    tool_choice: { type: 'tool', name: input.tool.name },
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await getClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    stop_reason?: string;
  } = JSON.parse(decoded);

  const toolBlock = parsed.content?.find(
    (block): block is ToolUseBlock =>
      block.type === 'tool_use' && block.name === input.tool.name,
  );

  if (!toolBlock) {
    throw new Error(
      `Bedrock tool_use response did not contain a ${input.tool.name} call. stop_reason=${parsed.stop_reason}`,
    );
  }

  return toolBlock.input as T;
}

export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const toParse = fenced?.[1]?.trim() ?? raw.trim();
  return JSON.parse(toParse) as T;
}

/* ------------------------------------------------------------------ */
/*  Vision (multimodal) tool_use                                       */
/* ------------------------------------------------------------------ */

export type VisionImage = {
  /** Base64 encoded image bytes. */
  base64: string;
  /** e.g. 'image/png' or 'image/jpeg'. */
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
};

/**
 * tool_use call with one or more images attached to the user message.
 * Use this for the vision reviewer that critiques rendered slides.
 */
export async function invokeBedrockVisionToolUse<T>(input: {
  system: string;
  text: string;
  images: VisionImage[];
  tool: ToolDefinition;
  maxTokens?: number;
}): Promise<T> {
  const modelId = resolveTextModelId();
  const content: Array<Record<string, unknown>> = [
    ...input.images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.base64,
      },
    })),
    { type: 'text', text: input.text },
  ];

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: input.maxTokens ?? 4096,
    system: input.system,
    messages: [{ role: 'user', content }],
    tools: [input.tool],
    tool_choice: { type: 'tool', name: input.tool.name },
  });

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(body),
  });

  const response = await getClient().send(command);
  const decoded = new TextDecoder().decode(response.body);
  const parsed: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    stop_reason?: string;
  } = JSON.parse(decoded);

  const toolBlock = parsed.content?.find(
    (block): block is ToolUseBlock =>
      block.type === 'tool_use' && block.name === input.tool.name,
  );

  if (!toolBlock) {
    throw new Error(
      `Bedrock vision tool_use response did not contain a ${input.tool.name} call. stop_reason=${parsed.stop_reason}`,
    );
  }

  return toolBlock.input as T;
}
