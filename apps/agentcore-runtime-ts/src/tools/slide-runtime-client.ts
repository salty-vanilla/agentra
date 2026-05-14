import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuidv7 } from 'uuidv7';
import {
  createCallTelemetry,
  executeWithTimeout,
  formatTelemetryLog,
  TimeoutError,
} from '../lib/timeout-handler.js';

// --- Types ---

export interface SlideRuntimeStructuredError {
  message: string;
  phase?: string;
  details?: string | undefined;
}

export interface SlideRuntimePresentationResult {
  success: boolean;
  summary: string;
  workDir: string;
  pptxPath?: string | undefined;
  sourceJsPath?: string | undefined;
  contactSheetPath?: string | undefined;
  renderedSlidePaths?: string[] | undefined;
  diagnosticsStatus?: 'pass' | 'warn' | 'fail' | undefined;
  revisionAttempted?: boolean | undefined;
  revisionSucceeded?: boolean | undefined;
  revisionReason?: string | undefined;
  artifacts: Array<Record<string, unknown>>;
  warnings: string[];
  brandFrameId?: string | undefined;
  brandFrameName?: string | undefined;
  icons?: Record<string, unknown> | undefined;
  images?: Record<string, unknown> | undefined;
  uploadedArtifacts?: Array<Record<string, unknown>> | undefined;
  pptxDownloadUrl?: string | undefined;
  contactSheetDownloadUrl?: string | undefined;
  error?: SlideRuntimeStructuredError | undefined;
}

export interface InvokeSlideRuntimeInput {
  prompt: string;
  language?: 'ja' | 'en' | undefined;
  traceId?: string | undefined;
  sessionId?: string | undefined;
  brandFrameId?: string | undefined;
}

export interface InvokeSlideRuntimeResult {
  success: boolean;
  text: string;
  result?: SlideRuntimePresentationResult | undefined;
  error?: SlideRuntimeStructuredError | undefined;
}

// --- Config ---

const SLIDE_RUNTIME_ARN = process.env.SLIDE_AGENTCORE_RUNTIME_ARN ?? '';
const SLIDE_RUNTIME_QUALIFIER =
  process.env.SLIDE_AGENTCORE_RUNTIME_QUALIFIER?.trim() || undefined;

const client = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
});

function isStructuredPresentationResult(
  value: unknown,
): value is SlideRuntimePresentationResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.success === 'boolean' && typeof record.summary === 'string';
}

function unwrapContentText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (!('content' in record) || !Array.isArray(record.content)) return undefined;

  const textContent = (record.content as Array<{ text?: unknown }>).find(
    (c) => typeof c.text === 'string',
  );
  return typeof textContent?.text === 'string' ? textContent.text : undefined;
}

function parseRuntimePayload(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function parseStructuredResponse(value: unknown): InvokeSlideRuntimeResult | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    const parsed = parseRuntimePayload(value);
    if (parsed && parsed !== value) {
      return parseStructuredResponse(parsed);
    }
    return { success: true, text: value };
  }

  if (isStructuredPresentationResult(value)) {
    return {
      success: value.success,
      text: value.summary,
      result: value,
      ...(value.error ? { error: value.error } : {}),
    };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    const contentText = unwrapContentText(record);
    if (typeof contentText === 'string') {
      const parsed = parseRuntimePayload(contentText);
      if (parsed && parsed !== contentText) {
        return parseStructuredResponse(parsed);
      }
      return { success: true, text: contentText };
    }

    if (
      typeof record.type === 'string' &&
      record.type === 'text' &&
      typeof record.text === 'string'
    ) {
      return { success: true, text: record.text };
    }

    if (typeof record.text === 'string') {
      return { success: true, text: record.text };
    }

    if (typeof record.summary === 'string' && typeof record.success === 'boolean') {
      const result = isStructuredPresentationResult(record)
        ? (record as SlideRuntimePresentationResult)
        : undefined;
      return {
        success: record.success,
        text: record.summary,
        ...(result ? { result } : {}),
        ...(typeof record.error === 'object' && record.error
          ? { error: record.error as SlideRuntimeStructuredError }
          : {}),
      };
    }
  }

  return undefined;
}

// --- Response parsing ---

export function parseSlideRuntimeResponse(rawText: string): InvokeSlideRuntimeResult {
  if (!rawText.trim()) {
    return {
      success: false,
      text: '',
      error: { message: 'Empty response from Slide Runtime.' },
    };
  }

  const parsed = parseStructuredResponse(parseRuntimePayload(rawText));
  if (parsed) {
    return parsed;
  }

  return { success: true, text: rawText };
}

// --- Invocation ---

const SLIDE_RUNTIME_TIMEOUT_MS = 120000; // 2 minutes

export async function invokeSlideRuntime(
  input: InvokeSlideRuntimeInput,
  abortSignal?: AbortSignal,
): Promise<InvokeSlideRuntimeResult> {
  if (!SLIDE_RUNTIME_ARN) {
    throw new Error(
      'SLIDE_AGENTCORE_RUNTIME_ARN is not configured. Cannot invoke Slide Runtime.',
    );
  }

  const telemetry = createCallTelemetry();
  const sessionId = input.sessionId ?? uuidv7();

  try {
    const payload = {
      prompt: input.prompt,
      ...(input.language ? { language: input.language } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(input.brandFrameId ? { brandFrameId: input.brandFrameId } : {}),
    };

    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: SLIDE_RUNTIME_ARN,
      qualifier: SLIDE_RUNTIME_QUALIFIER,
      runtimeSessionId: sessionId,
      contentType: 'application/json',
      accept: 'application/json',
      payload: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const result = await executeWithTimeout(
      async (signal) => {
        const response = await client.send(command, {
          abortSignal: signal,
        });

        let rawText = '';
        const body = response.response as
          | { transformToString?: () => Promise<string> }
          | AsyncIterable<unknown>
          | undefined;

        if (body && Symbol.asyncIterator in (body as object)) {
          for await (const chunk of body as AsyncIterable<unknown>) {
            if (signal.aborted) {
              throw new Error('Request was cancelled');
            }
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

        return rawText;
      },
      {
        timeoutMs: SLIDE_RUNTIME_TIMEOUT_MS,
        onTimeout: (reason) => {
          console.warn(`[slide-runtime] timeout: ${reason}`);
        },
      },
      telemetry,
    );

    return parseSlideRuntimeResponse(result);
  } catch (error) {
    if (error instanceof TimeoutError) {
      const logMessage = formatTelemetryLog('slide-runtime-invoke', telemetry);
      console.error(`[slide-runtime] ${logMessage}`);
      throw new Error(
        `Slide Runtime invocation timed out after ${SLIDE_RUNTIME_TIMEOUT_MS}ms`,
      );
    }

    if (abortSignal?.aborted) {
      throw new Error('Slide Runtime invocation was cancelled');
    }

    const logMessage = formatTelemetryLog('slide-runtime-invoke', telemetry);
    console.error(`[slide-runtime] ${logMessage}`);
    throw error;
  }
}
