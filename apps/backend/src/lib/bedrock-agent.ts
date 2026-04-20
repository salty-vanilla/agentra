import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';

export type ModelKey = 'opus' | 'sonnet' | 'haiku';

const MODEL_ID_MAP: Record<ModelKey, string> = {
  opus: 'us.anthropic.claude-opus-4-6-v1',
  sonnet: 'us.anthropic.claude-sonnet-4-6',
  haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
};

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? 'us-east-1',
});

const AGENTCORE_RUNTIME_ARN = process.env.AGENTCORE_RUNTIME_ARN ?? '';
const AGENTCORE_RUNTIME_QUALIFIER =
  process.env.AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

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
    throw new Error('AGENTCORE_RUNTIME_ARN is not set. AgentCore runtime is required.');
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
 * Streams text chunks from an AgentCore Runtime invocation.
 * Uses thread.threadId as runtime sessionId so context is preserved
 * across messages within the same thread.
 */
export async function* invokeAgentStream(
  modelKey: ModelKey,
  sessionId: string,
  inputText: string,
): AsyncGenerator<string> {
  yield* invokeAgentCoreRuntimeStream(modelKey, sessionId, inputText);
}

export function getModelId(modelKey: ModelKey): string {
  return MODEL_ID_MAP[modelKey];
}
