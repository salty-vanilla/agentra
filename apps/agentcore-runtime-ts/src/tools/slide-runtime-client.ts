import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuidv7 } from 'uuidv7';

// --- Types ---

export interface InvokeSlideRuntimeInput {
  prompt: string;
  language?: 'ja' | 'en' | undefined;
  diagnostics?: boolean | undefined;
  revision?: boolean | undefined;
  traceId?: string | undefined;
  sessionId?: string | undefined;
}

export interface InvokeSlideRuntimeResult {
  success: boolean;
  summary?: string;
  pptxDownloadUrl?: string;
  contactSheetDownloadUrl?: string;
  uploadedArtifacts?: Array<{
    kind: string;
    label: string;
    s3Uri?: string;
    downloadUrl?: string;
    uploaded?: boolean;
  }>;
  diagnosticsStatus?: 'pass' | 'warn' | 'fail';
  revisionAttempted?: boolean;
  revisionSucceeded?: boolean;
  revisionReason?: string;
  warnings?: string[];
  error?: {
    message: string;
    phase?: string;
    details?: string;
  };
  rawText?: string;
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
  try {
    const direct = JSON.parse(rawText) as Record<string, unknown>;
    if ('success' in direct) {
      return direct as unknown as InvokeSlideRuntimeResult;
    }
    if ('content' in direct && Array.isArray(direct.content)) {
      const textContent = (direct.content as Array<{ text?: string }>).find(
        (c) => typeof c.text === 'string',
      );
      if (textContent?.text) {
        const inner = JSON.parse(textContent.text) as Record<string, unknown>;
        if ('success' in inner) {
          return inner as unknown as InvokeSlideRuntimeResult;
        }
      }
    }
  } catch {
    // Not valid JSON
  }

  const jsonMatch = rawText.match(/\{[\s\S]*"success"\s*:/);
  if (jsonMatch) {
    const startIndex = rawText.indexOf(jsonMatch[0]);
    const candidate = rawText.slice(startIndex);
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if ('success' in parsed) {
        return parsed as unknown as InvokeSlideRuntimeResult;
      }
    } catch {
      // Partial JSON
    }
  }

  return {
    success: false,
    rawText,
    error: {
      message: 'Could not parse Slide Runtime response.',
      phase: 'response-parsing',
    },
  };
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
    ...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
    ...(input.revision !== undefined ? { revision: input.revision } : {}),
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
