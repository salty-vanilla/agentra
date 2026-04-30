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
    'anthropic.claude-sonnet-4-20250514-v1:0'
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

export function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const toParse = fenced?.[1]?.trim() ?? raw.trim();
  return JSON.parse(toParse) as T;
}
