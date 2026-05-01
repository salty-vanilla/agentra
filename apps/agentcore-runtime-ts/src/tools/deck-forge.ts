import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { tool } from '@strands-agents/sdk';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

type ToolResponse = {
  status: 'success' | 'error';
  content: Array<{ text: string }>;
};

type DeckForgeRuntimeMessage =
  | {
      type: 'deck_forge_result';
      runId: string;
      result: unknown;
      artifact?: unknown;
    }
  | {
      type: 'deck_forge_error';
      runId: string;
      error: string;
    };

type DeckForgeRunResultSummary = {
  finalStatus?: string;
  mode?: string;
  errors?: unknown;
  validationStatus?: unknown;
  slideCount?: number;
  exportResult?: unknown;
};

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
});

const DECK_FORGE_RUNTIME_ARN = process.env.DECK_FORGE_RUNTIME_ARN ?? '';
const DECK_FORGE_RUNTIME_QUALIFIER =
  process.env.DECK_FORGE_RUNTIME_QUALIFIER?.trim() || undefined;

function success(data: unknown): ToolResponse {
  return {
    status: 'success',
    content: [{ text: JSON.stringify(data) }],
  };
}

function failure(message: string): ToolResponse {
  return {
    status: 'error',
    content: [{ text: message }],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarizeDeckForgeResult(result: unknown): DeckForgeRunResultSummary {
  if (!isRecord(result)) {
    return {};
  }

  const summary: DeckForgeRunResultSummary = {};
  const artifacts = isRecord(result.artifacts) ? result.artifacts : undefined;
  const presentation = isRecord(artifacts?.presentation)
    ? artifacts.presentation
    : undefined;
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : undefined;
  const validationReport = isRecord(result.validationReport)
    ? result.validationReport
    : undefined;

  if (typeof result.finalStatus === 'string') summary.finalStatus = result.finalStatus;
  if (typeof result.mode === 'string') summary.mode = result.mode;
  if ('errors' in result) summary.errors = result.errors;
  if (validationReport && 'status' in validationReport) {
    summary.validationStatus = validationReport.status;
  }
  if (slides) summary.slideCount = slides.length;
  if ('exportResult' in result) summary.exportResult = result.exportResult;

  return summary;
}

function deckForgeResultFailed(result: unknown): boolean {
  return isRecord(result) && result.finalStatus === 'failed';
}

function deckForgeResultErrorMessage(result: unknown): string {
  if (!isRecord(result)) {
    return 'Deck Forge failed.';
  }

  if (Array.isArray(result.errors)) {
    const messages = result.errors
      .map((entry) =>
        isRecord(entry) && typeof entry.message === 'string' ? entry.message : undefined,
      )
      .filter((message): message is string => !!message);
    if (messages.length > 0) {
      return messages.join('\n');
    }
  }

  return 'Deck Forge failed without a detailed error.';
}

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

function parseRuntimeMessage(raw: string): DeckForgeRuntimeMessage | undefined {
  try {
    const parsed = JSON.parse(raw) as
      | {
          event?: string;
          data?: unknown;
        }
      | {
          type?: string;
          runId?: string;
          result?: unknown;
          artifact?: unknown;
          error?: string;
        };

    const payload =
      parsed && typeof parsed === 'object' && 'event' in parsed ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const typed = payload as {
      type?: string;
      runId?: string;
      result?: unknown;
      artifact?: unknown;
      error?: string;
    };

    if (
      typed.type === 'deck_forge_result' &&
      typeof typed.runId === 'string' &&
      typed.runId.length > 0
    ) {
      return {
        type: 'deck_forge_result',
        runId: typed.runId,
        result: typed.result,
        artifact: typed.artifact,
      };
    }

    if (
      typed.type === 'deck_forge_error' &&
      typeof typed.runId === 'string' &&
      typed.runId.length > 0 &&
      typeof typed.error === 'string'
    ) {
      return {
        type: 'deck_forge_error',
        runId: typed.runId,
        error: typed.error,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function collectDeckForgeRuntimeMessage(
  body: unknown,
): Promise<DeckForgeRuntimeMessage> {
  const streamBody = body as {
    transformToString?: () => Promise<string>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (streamBody?.[Symbol.asyncIterator]) {
    let buffer = '';
    for await (const chunk of streamBody as AsyncIterable<unknown>) {
      buffer += decodeRuntimeChunk(chunk);

      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        const parsed = parseRuntimeMessage(data);
        if (parsed) {
          return parsed;
        }
      }
    }

    if (buffer.trim()) {
      const parsed = parseRuntimeMessage(buffer.trim());
      if (parsed) {
        return parsed;
      }
    }
  }

  if (streamBody?.transformToString) {
    const payload = await streamBody.transformToString();
    const parsed = parseRuntimeMessage(payload);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error('Deck Forge runtime returned an unrecognized response payload.');
}

async function invokeDeckForgeRuntime(
  input: DeckForgeRequest,
): Promise<DeckForgeRuntimeMessage> {
  if (!DECK_FORGE_RUNTIME_ARN) {
    throw new Error('DECK_FORGE_RUNTIME_ARN is not set. Deck Forge runtime is required.');
  }

  const traceId = input.traceId ?? uuidv7();
  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: DECK_FORGE_RUNTIME_ARN,
    qualifier: DECK_FORGE_RUNTIME_QUALIFIER,
    runtimeSessionId: traceId,
    traceId,
    contentType: 'application/json',
    accept: 'text/event-stream',
    payload: new TextEncoder().encode(JSON.stringify({ ...input, traceId })),
  });

  const response = await agentCoreClient.send(command);
  if (!response.response) {
    throw new Error('Deck Forge runtime response body is empty.');
  }

  return collectDeckForgeRuntimeMessage(response.response);
}

const DeckForgeRequestSchema = z.object({
  goal: z.string().trim().min(1).describe('The presentation goal or request.'),
  mode: z.enum(['create', 'modify']).default('create'),
  exportFormat: z.enum(['pptx', 'html', 'json', 'pdf']).default('pptx'),
  validationLevel: z.enum(['basic', 'strict', 'export']).default('export'),
  acquisitionMode: z.enum(['generate', 'retrieve', 'auto']).default('generate'),
  imageProvider: z.enum(['pexels', 'unsplash', 'pixabay']).default('pexels'),
  autoFix: z.boolean().default(true),
  revisionPolicy: z
    .enum(['none', 'validation_only', 'ai_review'])
    .default('validation_only'),
  reviewTrigger: z.enum(['errors', 'warnings', 'always']).default('warnings'),
  renderSlideImages: z.boolean().default(false),
  visionReview: z.boolean().default(false),
  visionRevision: z.boolean().default(false),
  designPass: z.boolean().default(true),
  designReviewIterations: z.number().int().min(0).max(3).default(2),
  includeTrace: z.boolean().default(false),
  presentation: z.unknown().optional(),
  operations: z.array(z.unknown()).optional(),
  traceId: z.string().trim().min(1).optional(),
});

type DeckForgeRequest = z.infer<typeof DeckForgeRequestSchema>;

const deckForgeTool = tool({
  name: 'deck_forge_runtime',
  description:
    'Invoke the Deck Forge AgentCore runtime to generate or modify presentation decks.',
  inputSchema: DeckForgeRequestSchema,
  callback: async (input) => {
    try {
      const message = await invokeDeckForgeRuntime(input);

      if (message.type === 'deck_forge_error') {
        return failure(message.error);
      }

      if (deckForgeResultFailed(message.result)) {
        return failure(deckForgeResultErrorMessage(message.result));
      }

      return success({
        runId: message.runId,
        result: summarizeDeckForgeResult(message.result),
        artifact: message.artifact,
      });
    } catch (error) {
      return failure(errorMessage(error));
    }
  },
});

export { deckForgeTool };
