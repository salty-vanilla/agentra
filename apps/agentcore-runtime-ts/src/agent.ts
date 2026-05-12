import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { buildRouterPrompt, createRouterAgent } from './agents/router/index.js';
import { buildLoggerOptions } from './logging.js';
import { createRuntimeSessionManager } from './memory/session-manager-factory.js';
import { ObservationCollector } from './observability.js';
import type { SubAgentProgressEvent } from './tools/invoke-manufacturing-line-agent.tool.js';

export type {
  ManufacturingLineAgentConfig,
  ManufacturingLineAgentResult,
  ManufacturingLineModelConfig,
} from './agents/manufacturing-line/index.js';
export { createManufacturingLineAgent } from './agents/manufacturing-line/index.js';
export type {
  RouterAgentConfig,
  RouterModelConfig,
  RouterPromptInput,
  RouterToneKey,
} from './agents/router/index.js';
export { buildRouterPrompt, createRouterAgent } from './agents/router/index.js';
export type {
  WebResearchAgentConfig,
  WebResearchAgentHandoffInput,
  WebResearchAgentHandoffOutput,
  WebResearchAgentResult,
  WebResearchModelConfig,
} from './agents/web-research/index.js';
export { createWebResearchAgent } from './agents/web-research/index.js';

type ModelKey = 'opus' | 'sonnet' | 'haiku';
type ResponsePreset = 'fast' | 'balanced' | 'deep';
type ToneKey = 'business' | 'engineer';
type LengthKey = 'short' | 'normal' | 'detailed';

const MODEL_IDS: Record<ModelKey, string> = {
  opus: process.env.BEDROCK_MODEL_ID_OPUS ?? 'global.anthropic.claude-opus-4-6-v1',
  sonnet: process.env.BEDROCK_MODEL_ID_SONNET ?? 'global.anthropic.claude-sonnet-4-6',
  haiku:
    process.env.BEDROCK_MODEL_ID_HAIKU ??
    'global.anthropic.claude-haiku-4-5-20251001-v1:0',
};

const DEFAULT_REGION = process.env.AWS_REGION ?? 'us-east-1';
const OBSERVABILITY_DEBUG_LOG = process.env.OBSERVABILITY_DEBUG_LOG === 'true';
const DEFAULT_PRESET: ResponsePreset = 'balanced';
const DEFAULT_TONE: ToneKey = 'business';
const DEFAULT_LENGTH: LengthKey = 'normal';

type GenerationConfig = {
  model: ModelKey;
  temperature: number;
};

const PRESETS: Record<ResponsePreset, GenerationConfig> = {
  fast: {
    model: 'haiku',
    temperature: 0.3,
  },
  balanced: {
    model: 'sonnet',
    temperature: 0.5,
  },
  deep: {
    model: 'opus',
    temperature: 0.7,
  },
};

const LENGTH_CONFIG: Record<LengthKey, { maxTokens: number }> = {
  short: { maxTokens: 1024 },
  normal: { maxTokens: 4096 },
  detailed: { maxTokens: 8192 },
};

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).default('Hello! How can I help you today?'),
  preset: z.enum(['fast', 'balanced', 'deep']).default(DEFAULT_PRESET),
  tone: z.enum(['business', 'engineer']).default(DEFAULT_TONE),
  length: z.enum(['short', 'normal', 'detailed']).default(DEFAULT_LENGTH),
  traceId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
});

function nowIso(): string {
  return new Date().toISOString();
}

function createTraceId(): string {
  return uuidv7();
}

function resolveConfig(
  preset: ResponsePreset,
  length: LengthKey,
): {
  modelId: string;
  region: string;
  temperature: number;
  maxTokens: number;
} {
  const base = PRESETS[preset];
  const tokenConfig = LENGTH_CONFIG[length];

  return {
    modelId: MODEL_IDS[base.model],
    region: DEFAULT_REGION,
    temperature: base.temperature,
    maxTokens: tokenConfig.maxTokens,
  };
}

const app = new BedrockAgentCoreApp({
  config: {
    logging: {
      options: buildLoggerOptions(),
    },
  },
  invocationHandler: {
    requestSchema: RequestSchema,

    process: async function* (request) {
      const userId = request.userId || 'dev-user';
      const threadId = request.threadId || `ephemeral-${createTraceId()}`;

      const session = await createRuntimeSessionManager({ userId, threadId });

      const agent = createRouterAgent({
        modelConfig: resolveConfig(request.preset, request.length),
        sessionManager: session.sessionManager,
      });
      const finalPrompt = buildRouterPrompt({
        userPrompt: request.prompt,
        tone: request.tone,
      });
      const traceId = request.traceId ?? createTraceId();
      const startedAt = nowIso();
      const observability = new ObservationCollector(
        traceId,
        startedAt,
        OBSERVABILITY_DEBUG_LOG,
      );

      try {
        const stream = agent.stream(finalPrompt);
        while (true) {
          const { value, done } = await stream.next();
          if (done) {
            observability.onAgentMetrics(value.metrics);
            observability.finalizeMissingToolCounts();
            break;
          }

          const event = value;
          observability.logStreamEventType(event.type);

          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event.type === 'modelContentBlockDeltaEvent' &&
            event.event.delta.type === 'textDelta'
          ) {
            yield {
              event: 'message',
              data: {
                type: 'text',
                text: event.event.delta.text,
              },
            };
            continue;
          }

          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event.type === 'modelContentBlockDeltaEvent' &&
            event.event.delta.type === 'reasoningContentDelta'
          ) {
            observability.onReasoningDelta(event.event.delta.text);
            continue;
          }

          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event.type === 'modelContentBlockStartEvent' &&
            event.event.start?.type === 'toolUseStart'
          ) {
            observability.onModelToolUseStart(
              event.event.start.toolUseId,
              event.event.start.name,
            );
            continue;
          }

          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event.type === 'modelMetadataEvent'
          ) {
            observability.onModelMetadataUsage(event.event.usage);
            yield {
              event: 'message',
              data: {
                type: 'observation',
                observation: observability.createSnapshot('success'),
              },
            };
            continue;
          }

          if (
            event.type === 'contentBlockEvent' &&
            event.contentBlock.type === 'toolUseBlock'
          ) {
            observability.onContentToolUseBlock(
              event.contentBlock.toolUseId,
              event.contentBlock.name,
            );
            continue;
          }

          if (event.type === 'toolStreamUpdateEvent') {
            const progress = event.event.data as SubAgentProgressEvent | undefined;
            if (progress && typeof progress.stage === 'string') {
              yield {
                event: 'message',
                data: {
                  type: 'observation',
                  observation: observability.createSnapshot('success'),
                  subAgentStage: progress,
                },
              };
            }
            continue;
          }

          if (event.type === 'toolResultEvent') {
            observability.onToolResult(
              event.result.toolUseId,
              event.result.status === 'error' ? 'error' : 'success',
              event.result.content,
            );
            yield {
              event: 'message',
              data: {
                type: 'observation',
                observation: observability.createSnapshot('success'),
              },
            };
            continue;
          }

          if (event.type === 'agentResultEvent') {
            observability.onAgentMetrics(event.result.metrics);
          }
        }

        const finalObservation = observability.createSnapshot('success');
        observability.logFinalSummary();

        yield {
          event: 'message',
          data: {
            type: 'done',
            observabilitySummary: finalObservation,
          },
        };
      } catch (error: unknown) {
        const finalObservation = observability.createSnapshot('error');
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Runtime processing failed.';

        yield {
          event: 'message',
          data: {
            type: 'error',
            error: message,
            observabilitySummary: finalObservation,
          },
        };
      }
    },
  },
});

app.run();
