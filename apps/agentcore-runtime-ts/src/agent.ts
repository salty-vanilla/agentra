import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { buildRouterPrompt, createRouterAgent } from './agents/router/index.js';
import { buildLoggerOptions } from './logging.js';
import { createRuntimeSessionManager } from './memory/session-manager-factory.js';
import { ObservationCollector } from './observability.js';
import { RuntimeLogger } from './runtime-logger.js';
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

const MODEL_TO_PRESET: Record<ModelKey, ResponsePreset> = {
  haiku: 'fast',
  sonnet: 'balanced',
  opus: 'deep',
};

const LENGTH_CONFIG: Record<LengthKey, { maxTokens: number }> = {
  short: { maxTokens: 1024 },
  normal: { maxTokens: 4096 },
  detailed: { maxTokens: 8192 },
};

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).default('Hello! How can I help you today?'),
  model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
  preset: z.enum(['fast', 'balanced', 'deep']).default(DEFAULT_PRESET),
  tone: z.enum(['business', 'engineer']).default(DEFAULT_TONE),
  length: z.enum(['short', 'normal', 'detailed']).default(DEFAULT_LENGTH),
  commandDirective: z.string().optional(),
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

      const effectivePreset = request.model
        ? MODEL_TO_PRESET[request.model]
        : request.preset;
      const agent = createRouterAgent({
        modelConfig: resolveConfig(effectivePreset, request.length),
        sessionManager: session.sessionManager,
      });
      const finalPrompt = buildRouterPrompt({
        userPrompt: request.prompt,
        tone: request.tone,
        commandDirective: request.commandDirective,
      });
      const traceId = request.traceId ?? createTraceId();
      const startedAt = nowIso();
      const observability = new ObservationCollector(
        traceId,
        startedAt,
        OBSERVABILITY_DEBUG_LOG,
      );
      const modelId = resolveConfig(effectivePreset, request.length).modelId;
      const logger = new RuntimeLogger(traceId, threadId, modelId);
      logger.setRuntimeSessionId(threadId);
      const toolStartTimes = new Map<string, { name: string; startedAt: number }>();

      logger.logInvocationStart({
        userId,
        preset: effectivePreset,
        length: request.length,
      });

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
            const { toolUseId, name } = event.event.start;
            toolStartTimes.set(toolUseId, { name, startedAt: Date.now() });
            observability.onModelToolUseStart(toolUseId, name);
            logger.logToolCallStart(toolUseId, name);
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
            const { toolUseId } = event.result;
            const toolInfo = toolStartTimes.get(toolUseId);
            toolStartTimes.delete(toolUseId);
            const toolDuration = toolInfo ? Date.now() - toolInfo.startedAt : 0;
            const toolName = toolInfo?.name ?? 'unknown_tool';
            const toolStatus = event.result.status === 'error' ? 'error' : 'success';
            observability.onToolResult(toolUseId, toolStatus, event.result.content);
            if (toolStatus === 'error') {
              logger.logToolCallError(toolUseId, toolName, toolDuration);
            } else {
              logger.logToolCallEnd(toolUseId, toolName, toolDuration);
            }
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
        const durationMs = Math.max(
          0,
          new Date(finalObservation.completedAt).getTime() -
            new Date(startedAt).getTime(),
        );
        logger.logInvocationEnd(durationMs, {
          tokenUsage: finalObservation.tokenUsage,
          toolCallCount: finalObservation.toolCallCount,
          toolFailureCount: finalObservation.toolFailureCount,
        });

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

        observability.logErrorSummary(finalObservation);
        logger.logInvocationError(error, {
          finalObservation,
        });

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
