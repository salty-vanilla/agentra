import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export type ModelKey = 'opus' | 'sonnet' | 'haiku';

interface AgentConfig {
  id: string;
  aliasId: string;
  modelId: string;
}

// NOTE: Model IDs are for reference only. The agentId/aliasId point to the
// actual Bedrock Agent resource which has the foundationModel fixed at creation.
// Verify model IDs with: aws bedrock list-foundation-models --region ap-northeast-1
const AGENT_MAP: Record<ModelKey, AgentConfig> = {
  opus: {
    id: process.env.BEDROCK_AGENT_ID_OPUS ?? '',
    aliasId: process.env.BEDROCK_AGENT_ALIAS_ID_OPUS ?? '',
    modelId: 'anthropic.claude-opus-4-5:0',
  },
  sonnet: {
    id: process.env.BEDROCK_AGENT_ID_SONNET ?? '',
    aliasId: process.env.BEDROCK_AGENT_ALIAS_ID_SONNET ?? '',
    modelId: 'anthropic.claude-sonnet-4-5:0',
  },
  haiku: {
    id: process.env.BEDROCK_AGENT_ID_HAIKU ?? '',
    aliasId: process.env.BEDROCK_AGENT_ALIAS_ID_HAIKU ?? '',
    modelId: 'anthropic.claude-haiku-4-5:0',
  },
};

const client = new BedrockAgentRuntimeClient({
  region: process.env.BEDROCK_REGION ?? 'ap-northeast-1',
});

/**
 * Streams text chunks from a Bedrock Agent invocation.
 * Uses thread.threadId as the AgentCore sessionId so context is preserved
 * across messages within the same thread (up to the 30-min idle TTL).
 */
export async function* invokeAgentStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
): AsyncGenerator<string> {
  const agent = AGENT_MAP[modelKey];

  if (!agent.id || !agent.aliasId) {
    throw new Error(
      `Bedrock agent config missing for model "${modelKey}". ` +
        `Set BEDROCK_AGENT_ID_${modelKey.toUpperCase()} and BEDROCK_AGENT_ALIAS_ID_${modelKey.toUpperCase()} env vars.`,
    );
  }

  const command = new InvokeAgentCommand({
    agentId: agent.id,
    agentAliasId: agent.aliasId,
    sessionId,
    inputText,
  });

  const response = await client.send(command);

  if (!response.completion) {
    return;
  }

  for await (const event of response.completion) {
    if (event.chunk?.bytes) {
      yield new TextDecoder().decode(event.chunk.bytes);
    }
  }
}

export function getModelId(modelKey: ModelKey): string {
  return AGENT_MAP[modelKey].modelId;
}
