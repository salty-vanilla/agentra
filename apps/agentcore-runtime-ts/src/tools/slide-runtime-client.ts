import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuidv7 } from 'uuidv7';

// --- Types ---

export interface InvokeSlideRuntimeInput {
  prompt: string;
  language?: 'ja' | 'en' | undefined;
  traceId?: string | undefined;
  sessionId?: string | undefined;
}

export interface InvokeSlideRuntimeResult {
  success: boolean;
  text: string;
  error?: {
    message: string;
  };
}

// --- Config ---

const SLIDE_RUNTIME_ARN = process.env.SLIDE_AGENTCORE_RUNTIME_ARN ?? '';
const SLIDE_RUNTIME_QUALIFIER =
  process.env.SLIDE_AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

const client = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
});

// --- Response parsing ---

export function parseSlideRuntimeResponse(rawText: string): InvokeSlideRuntimeResult {
  if (!rawText.trim()) {
    return {
      success: false,
      text: '',
      error: { message: 'Empty response from Slide Runtime.' },
    };
  }

  // The presentation-author-runtime returns plain text or JSON-wrapped text.
  // Try to unwrap { content: [{ text: "..." }] } shape (Strands SDK envelope).
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if ('content' in parsed && Array.isArray(parsed.content)) {
      const textContent = (parsed.content as Array<{ text?: string }>).find(
        (c) => typeof c.text === 'string',
      );
      if (textContent?.text) {
        return { success: true, text: textContent.text };
      }
    }
    // Direct { type: 'text', text: '...' } shape
    if (typeof parsed.text === 'string') {
      return { success: true, text: parsed.text };
    }
  } catch {
    // Not JSON — treat as plain text
  }

  return { success: true, text: rawText };
}

// --- Invocation ---

export async function invokeSlideRuntime(
  input: InvokeSlideRuntimeInput,
): Promise<InvokeSlideRuntimeResult> {
  if (!SLIDE_RUNTIME_ARN) {
    throw new Error(
      'SLIDE_AGENTCORE_RUNTIME_ARN is not configured. Cannot invoke Slide Runtime.',
    );
  }

  const sessionId = input.sessionId ?? uuidv7();
  const payload = {
    prompt: input.prompt,
    ...(input.language ? { language: input.language } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: SLIDE_RUNTIME_ARN,
    qualifier: SLIDE_RUNTIME_QUALIFIER,
    runtimeSessionId: sessionId,
    contentType: 'application/json',
    accept: 'application/json',
    payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const response = await client.send(command);

  let rawText = '';
  const body = response.response as
    | { transformToString?: () => Promise<string> }
    | AsyncIterable<unknown>
    | undefined;

  if (body && Symbol.asyncIterator in (body as object)) {
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (chunk instanceof Uint8Array) {
        rawText += new TextDecoder().decode(chunk);
      } else if (typeof chunk === 'string') {
        rawText += chunk;
      } else {
        rawText += String(chunk ?? '');
      }
    }
  } else if (body && 'transformToString' in body && body.transformToString) {
    rawText = await body.transformToString();
  }

  return parseSlideRuntimeResponse(rawText);
}
