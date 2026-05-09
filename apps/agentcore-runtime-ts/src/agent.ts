import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Agent,
  BedrockModel,
  type Plugin,
  type SessionManager,
} from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { buildLoggerOptions } from './logging.js';
import { createRuntimeSessionManager } from './memory/session-manager-factory.js';
import { ObservationCollector } from './observability.js';
import { buildGeneralTools } from './tools/registry.js';

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

const CALCULATION_TOOL_INSTRUCTIONS = [
  '数値計算、割合、増減率、平均、KPI集計が必要な場合は、暗算せず calculator または table_summary ツールを使ってください。',
  'スライドや報告書に使う数値は、可能な限りツール結果に基づいてください。',
].join('\n');

const EVIDENCE_TOOL_INSTRUCTIONS = [
  '外部情報、Web検索結果、ドキュメント検索結果、ツール実行結果を根拠として使う場合は、可能な限り normalize_evidence_source と build_citations で出典を整理してください。',
  '回答・レポート・スライド用briefでは、重要な主張に対して source / citation を対応づけることを優先してください。',
].join('\n');

const RAG_TOOL_INSTRUCTIONS = [
  '社内ナレッジ、プロジェクト固有情報、ドキュメント根拠が必要な場合は、設定済みのKnowledge Baseがあれば kb_retrieve で根拠を取得してください。',
  'kb_retrieve は回答生成ではなく根拠取得専用です。回答では取得した sources / citations を優先してください。',
  '問い合わせがあいまい、十分に具体的でない、または web fallback が必要か判断したい場合は、kb_query_readiness で deterministic な計画と readiness を先に確認してください。',
  'kb_query_readiness は文書取得や AWS 呼び出しを行いません。結果をもとに kb_retrieve、follow-up 質問、diagnostics、または web fallback を選んでください。',
  'Bedrock Knowledge Base の retrieval 設定を安全に点検したい場合は kb_rag_diagnostics を使い、AWS 呼び出しや文書取得とは切り分けてください。',
].join('\n');

const STRUCTURED_RAG_TOOL_INSTRUCTIONS = [
  '構造化データに対する問い合わせ、集計、ランキング、履歴確認、エラーコード逆引き、異常分析が必要な場合は、structured_query_plan で問い合わせ意図と不足情報を整理してください。',
  'structured_query_plan はSQL生成や実行を行わず、後続処理のための計画を作るだけです。',
  '構造化問い合わせを実行する前に、structured_plan_readiness で不足情報・推奨provider・次アクションを確認してください。',
  '構造化RAGを一連の流れで扱う場合は structured_rag_flow を使い、plan/validation/readiness/execution を安全にまとめてください。',
  'structured_rag_flow の結果をユーザー回答・レポート・スライドbriefに整える場合は structured_answer_synthesis を使って、根拠・注意点・次アクションを整理してください。',
  'Bedrock structured KB + Redshift Serverless PoC の設定確認が必要な場合は bedrock_structured_poc_diagnostics を使い、実データ取得とは区別してください。',
  'structured_query_execute_mock は構造化RAGパイプライン検証用のmock実行であり、SQL生成・DB接続・実データ取得は行いません。',
  'structured_query_execute_bedrock_stub は将来のBedrock KB structured provider向けの接続確認用stubであり、実データは取得しません。',
].join('\n');

const ARTIFACT_TOOL_INSTRUCTIONS = [
  'PPTX、PDF、HTML、PNG、JSON、テキストなどの生成物や中間成果物を整理する場合は、create_artifact_manifest で成果物メタデータを標準化してください。',
  'create_artifact_manifest はメタデータ整理のみを行い、ファイルの読み書き・存在確認・アップロードは行いません。',
].join('\n');

const BRIEF_TOOL_INSTRUCTIONS = [
  'ユーザー依頼、出典、成果物、制約、重要事実を後続処理に渡す必要がある場合は、create_brief または merge_briefs でbriefを整理してください。',
  'create_brief は明示的に与えられた情報を正規化するだけで、欠けている情報を推測しません。',
].join('\n');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../skills');

const agentSkillsPlugin = new AgentSkills({
  skills: [
    join(SKILLS_DIR, 'presentation-author-handoff'),
    join(SKILLS_DIR, 'rag-research'),
    join(SKILLS_DIR, 'web-research'),
  ],
});

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

const MEMORY_INSTRUCTIONS = [
  'セッション内の会話履歴やユーザーの好みが利用可能な場合は、参考にしてください。',
  'メモリが完全・最新であるとは限りません。',
  'ユーザーが「さっき」「前回」と言った場合は、現在のスレッド/セッションのコンテキストから解決してください。',
  '内部のメモリID・ストレージキーをユーザーに見せないでください。',
].join('\n');

function buildPrompt(input: {
  userPrompt: string;
  tone: ToneKey;
  commandDirective?: string;
}): string {
  const parts = [
    TONE_INSTRUCTIONS[input.tone],
    '',
    DATE_TOOL_INSTRUCTIONS,
    '',
    CALCULATION_TOOL_INSTRUCTIONS,
    '',
    EVIDENCE_TOOL_INSTRUCTIONS,
    '',
    RAG_TOOL_INSTRUCTIONS,
    '',
    STRUCTURED_RAG_TOOL_INSTRUCTIONS,
    '',
    ARTIFACT_TOOL_INSTRUCTIONS,
    '',
    BRIEF_TOOL_INSTRUCTIONS,
    '',
    MEMORY_INSTRUCTIONS,
  ];

  if (input.commandDirective) {
    parts.push('', input.commandDirective);
  }

  parts.push('', '以下がユーザーの依頼です。', input.userPrompt);

  return parts.join('\n');
}

function createAgent(config: {
  modelId: string;
  region: string;
  temperature: number;
  maxTokens: number;
  sessionManager?: SessionManager | undefined;
}): Agent {
  const model = new BedrockModel({
    modelId: config.modelId,
    region: config.region,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  });

  const plugins: Plugin[] = [agentSkillsPlugin];
  if (config.sessionManager) {
    plugins.push(config.sessionManager);
  }

  return new Agent({
    model,
    plugins,
    tools: buildGeneralTools(),
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
      const userId = request.userId || 'dev-user';
      const threadId = request.threadId || `ephemeral-${createTraceId()}`;

      const session = await createRuntimeSessionManager({ userId, threadId });

      const agent = createAgent({
        ...resolveConfig(request.preset, request.length),
        sessionManager: session.sessionManager,
      });
      const finalPrompt = buildPrompt({
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
