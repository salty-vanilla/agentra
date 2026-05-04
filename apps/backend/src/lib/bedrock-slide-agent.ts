import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuidv7 } from 'uuidv7';

// --- Types ---

export interface SlideRuntimeInvokeInput {
  prompt: string;
  language?: 'ja' | 'en' | undefined;
  diagnostics?: boolean | undefined;
  revision?: boolean | undefined;
  timeoutMs?: number | undefined;
  traceId?: string | undefined;
  sessionId?: string | undefined;
}

export interface SlideRuntimeArtifact {
  kind: string;
  path: string;
  label: string;
  exists: boolean;
}

export interface SlideRuntimeInvokeResult {
  success: boolean;
  summary?: string;
  workDir?: string;
  pptxPath?: string;
  sourceJsPath?: string;
  contactSheetPath?: string;
  renderedSlidePaths?: string[];
  diagnosticsStatus?: 'pass' | 'warn' | 'fail';
  revisionAttempted?: boolean;
  revisionSucceeded?: boolean;
  revisionReason?: string;
  artifacts?: SlideRuntimeArtifact[];
  warnings?: string[];
  uploadedArtifacts?: Array<{
    kind: string;
    label: string;
    localPath: string;
    bucket: string;
    key: string;
    s3Uri: string;
    downloadUrl?: string;
    uploaded: boolean;
    contentType?: string;
    sizeBytes?: number;
  }>;
  pptxDownloadUrl?: string;
  contactSheetDownloadUrl?: string;
  error?: {
    message: string;
    phase?: string;
    details?: string;
  };
  rawText?: string;
}

// --- Config ---

const SLIDE_AGENTCORE_RUNTIME_ARN = process.env.SLIDE_AGENTCORE_RUNTIME_ARN ?? '';
const SLIDE_AGENTCORE_RUNTIME_QUALIFIER =
  process.env.SLIDE_AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? 'us-east-1',
});

// --- Response parsing ---

/**
 * Attempts to extract a SlideRuntimeInvokeResult from the raw response text.
 * The Slide Runtime returns Strands tool responses which contain JSON in content[].text.
 */
export function parseSlideRuntimeResponse(rawText: string): SlideRuntimeInvokeResult {
  // Try direct JSON parse first
  try {
    const direct = JSON.parse(rawText) as Record<string, unknown>;
    if ('success' in direct) {
      return direct as unknown as SlideRuntimeInvokeResult;
    }
    // Strands response shape: { status, content: [{ text: "..." }] }
    if ('content' in direct && Array.isArray(direct.content)) {
      const textContent = (direct.content as Array<{ text?: string }>).find(
        (c) => typeof c.text === 'string',
      );
      if (textContent?.text) {
        const inner = JSON.parse(textContent.text) as Record<string, unknown>;
        if ('success' in inner) {
          return inner as unknown as SlideRuntimeInvokeResult;
        }
      }
    }
  } catch {
    // Not valid JSON, continue
  }

  // Try to find JSON in text (e.g. SSE data lines concatenated)
  const jsonMatch = rawText.match(/\{[\s\S]*"success"\s*:/);
  if (jsonMatch) {
    const startIndex = rawText.indexOf(jsonMatch[0]);
    const candidate = rawText.slice(startIndex);
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if ('success' in parsed) {
        return parsed as unknown as SlideRuntimeInvokeResult;
      }
    } catch {
      // Partial JSON, can't parse
    }
  }

  // Fallback: return raw text
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
  input: SlideRuntimeInvokeInput,
): Promise<SlideRuntimeInvokeResult> {
  if (!SLIDE_AGENTCORE_RUNTIME_ARN) {
    throw new Error(
      'SLIDE_AGENTCORE_RUNTIME_ARN is not set. Slide Runtime is not configured.',
    );
  }

  const sessionId = input.sessionId ?? uuidv7();
  const payload = {
    prompt: input.prompt,
    ...(input.language ? { language: input.language } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
    ...(input.revision !== undefined ? { revision: input.revision } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: SLIDE_AGENTCORE_RUNTIME_ARN,
    qualifier: SLIDE_AGENTCORE_RUNTIME_QUALIFIER,
    runtimeSessionId: sessionId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    contentType: 'application/json',
    accept: 'application/json',
    payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const response = await agentCoreClient.send(command);

  // Read response body
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
