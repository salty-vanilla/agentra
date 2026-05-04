import { Agent, BedrockModel } from '@strands-agents/sdk';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { buildLoggerOptions } from './logging.js';
import { ObservationCollector } from './observability.js';
import { createSlidePresentationTool } from './tools/create-slide-presentation.js';
import { dateResolverTool } from './tools/date-resolver.js';

import {
  tavilyCrawlTool,
  tavilyExtractTool,
  tavilyMapTool,
  tavilySearchTool,
} from './tools/tavily.js';
import { weatherTool } from './tools/weather.js';

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
  short: { maxTokens: 512 },
  normal: { maxTokens: 2048 },
  detailed: { maxTokens: 4096 },
};

const TONE_INSTRUCTIONS: Record<ToneKey, string> = {
  business: [
    'あなたは社内向け業務支援AIです。',
    '回答は丁寧で簡潔、フォーマルな文体にしてください。',
    '曖昧な表現は避け、要点を整理して伝えてください。',
    '必要に応じて箇条書きを使ってください。',
  ].join('\n'),

  engineer: [
    'あなたは技術者向け支援AIです。',
    '回答は技術者向けに、正確かつ具体的にしてください。',
    '必要に応じて設計上のトレードオフ、実装観点、注意点を含めてください。',
    'コード例を出す場合は実用的なものにしてください。',
  ].join('\n'),
};

const DATE_TOOL_INSTRUCTIONS = [
  '日付・期間・締切・スケジュールに関する問い合わせでは、必要に応じて必ず date_resolver ツールを先に使ってください。',
  'today/tomorrow/next week/来週/3日後 などの相対表現は、date_resolver で絶対日付・絶対日時へ正規化してから回答してください。',
  '回答時は、可能な限り YYYY-MM-DD などの具体的な絶対日付を明示してください。',
].join('\n');

const SLIDE_TOOL_INSTRUCTIONS = [
  '# スライド生成',
  'ユーザーが PowerPoint / スライド / プレゼン資料 / PPTX / 報告資料 / 提案資料 / 研修資料を作成・生成・ドラフトするよう依頼した場合は、',
  'create_slide_presentation ツールを使ってください。',
  '',
  '例:',
  '- 「スライドを作って」',
  '- 「PowerPointにして」',
  '- 「PPTXを作成して」',
  '- 「報告資料を作って」',
  '- 「提案資料を作って」',
  '- 「製造ラインのQ2報告資料を作って」',
  '- "Create a presentation about..."',
  '- "Make a report deck for..."',
  '',
  'スライド生成は自分でPPTX XMLを書かないでください。必ず create_slide_presentation に委任してください。',
  '',
  'ツールが成功した場合、以下を簡潔にまとめてユーザーに返答してください:',
  '- 生成された資料の概要',
  '- PPTXダウンロードURL (pptxDownloadUrl)',
  '- コンタクトシートURL (contactSheetDownloadUrl) があれば',
  '- Diagnostics状態',
  '- Revision状態',
  '',
  'ツールが失敗した場合、失敗フェーズとメッセージを伝えてください。',
].join('\n');

const RequestSchema = z.object({
  prompt: z.string().trim().min(1).default('Hello! How can I help you today?'),
  preset: z.enum(['fast', 'balanced', 'deep']).default(DEFAULT_PRESET),
  tone: z.enum(['business', 'engineer']).default(DEFAULT_TONE),
  length: z.enum(['short', 'normal', 'detailed']).default(DEFAULT_LENGTH),
  traceId: z.string().trim().min(1).optional(),
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

function buildPrompt(userPrompt: string, tone: ToneKey): string {
  return [
    TONE_INSTRUCTIONS[tone],
    '',
    DATE_TOOL_INSTRUCTIONS,
    '',
    SLIDE_TOOL_INSTRUCTIONS,
    '',
    '以下がユーザーの依頼です。',
    userPrompt,
  ].join('\n');
}

function createAgent(config: {
  modelId: string;
  region: string;
  temperature: number;
  maxTokens: number;
}): Agent {
  const model = new BedrockModel({
    modelId: config.modelId,
    region: config.region,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  return new Agent({
    model,
    tools: [
      dateResolverTool,
      weatherTool,
      tavilySearchTool,
      tavilyExtractTool,
      tavilyCrawlTool,
      tavilyMapTool,
      createSlidePresentationTool,
    ],
  });
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
      const agent = createAgent(resolveConfig(request.preset, request.length));
      const finalPrompt = buildPrompt(request.prompt, request.tone);
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
