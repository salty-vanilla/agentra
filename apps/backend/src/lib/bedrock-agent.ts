import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
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
    modelId: 'us.anthropic.claude-opus-4-6-v1',
  },
  sonnet: {
    id: process.env.BEDROCK_AGENT_ID_SONNET ?? '',
    aliasId: process.env.BEDROCK_AGENT_ALIAS_ID_SONNET ?? '',
    modelId: 'us.anthropic.claude-sonnet-4-6',
  },
  haiku: {
    id: process.env.BEDROCK_AGENT_ID_HAIKU ?? '',
    aliasId: process.env.BEDROCK_AGENT_ALIAS_ID_HAIKU ?? '',
    modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  },
};

const client = new BedrockAgentRuntimeClient({
  region: process.env.BEDROCK_REGION ?? 'ap-northeast-1',
});

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? 'us-east-1',
});

const AGENTCORE_RUNTIME_ARN = process.env.AGENTCORE_RUNTIME_ARN ?? '';
const AGENTCORE_RUNTIME_QUALIFIER = process.env.AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

function decodeRuntimeChunk(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return new TextDecoder().decode(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(chunk));
  }
  if (ArrayBuffer.isView(chunk)) {
    return new TextDecoder().decode(
      new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
    );
  }
  return String(chunk ?? '');
}

function extractTextFromRuntimeEvent(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      type?: string;
      text?: string;
      delta?: string;
      data?: string;
      result?: string;
      message?: string;
      output?: string;
    };
    if (parsed.type === 'text' && parsed.text) {
      return parsed.text;
    }
    if (typeof parsed.text === 'string') {
      return parsed.text;
    }
    if (parsed.data && typeof parsed.data === 'object' && 'text' in parsed.data) {
      const text = (parsed.data as { text?: unknown }).text;
      if (typeof text === 'string') {
        return text;
      }
    }
    if (typeof parsed.delta === 'string') {
      return parsed.delta;
    }
    if (typeof parsed.data === 'string') {
      return parsed.data;
    }
    if (typeof parsed.result === 'string') {
      return parsed.result;
    }
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
    if (typeof parsed.output === 'string') {
      return parsed.output;
    }
  } catch {
    return raw;
  }
  return '';
}

async function* streamAgentCoreBody(
  contentType: string | undefined,
  body: unknown,
): AsyncGenerator<string> {
  const streamBody = body as {
    transformToString?: () => Promise<string>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (streamBody?.[Symbol.asyncIterator]) {
    const isSse = contentType?.includes('text/event-stream') ?? false;
    let buffer = '';

    for await (const chunk of streamBody as AsyncIterable<unknown>) {
      buffer += decodeRuntimeChunk(chunk);

      if (isSse) {
        let lineBreakIndex = buffer.indexOf('\n');
        while (lineBreakIndex >= 0) {
          const line = buffer.slice(0, lineBreakIndex).trim();
          buffer = buffer.slice(lineBreakIndex + 1);
          lineBreakIndex = buffer.indexOf('\n');

          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') {
            continue;
          }

          const text = extractTextFromRuntimeEvent(data);
          if (text) {
            yield text;
          }
        }
        continue;
      }
    }

    if (!isSse && buffer.trim()) {
      const text = extractTextFromRuntimeEvent(buffer.trim());
      if (text) {
        yield text;
      }
    }
    return;
  }

  if (streamBody?.transformToString) {
    const payload = await streamBody.transformToString();
    const text = extractTextFromRuntimeEvent(payload);
    if (text) {
      yield text;
    }
  }
}

async function* invokeAgentCoreRuntimeStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
): AsyncGenerator<string> {
  if (!AGENTCORE_RUNTIME_ARN) {
    throw new Error('AGENTCORE_RUNTIME_ARN is not set.');
  }

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: AGENTCORE_RUNTIME_ARN,
    qualifier: AGENTCORE_RUNTIME_QUALIFIER,
    runtimeSessionId: sessionId,
    contentType: 'application/json',
    accept: 'text/event-stream',
    payload: new TextEncoder().encode(
      JSON.stringify({
        prompt: inputText,
        model: modelKey,
      }),
    ),
  });

  const response = await agentCoreClient.send(command);
  if (!response.response) {
    return;
  }

  yield* streamAgentCoreBody(response.contentType, response.response);
}

/**
 * Streams text chunks from a Bedrock Agent invocation.
 * Uses thread.threadId as runtime sessionId so context is preserved
 * across messages within the same thread.
 */
export async function* invokeAgentStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
): AsyncGenerator<string> {
  if (AGENTCORE_RUNTIME_ARN) {
    yield* invokeAgentCoreRuntimeStream(modelKey, sessionId, inputText);
    return;
  }

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
