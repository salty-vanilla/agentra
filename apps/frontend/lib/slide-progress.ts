import type { ChatCommand, ProgressSummaryEvent } from '@agentra/shared';

const AUDIENCE_LABELS: Record<string, string> = {
  executive: '経営層',
  manager: '管理者',
  engineer: '技術者',
  operator: '現場向け',
  customer: '顧客向け',
  general: '一般',
};

const PURPOSE_LABELS: Record<string, string> = {
  report: '報告',
  proposal: '提案',
  decision: '意思決定',
  knowledge_share: '共有',
  training: '教育',
};

const LANGUAGE_LABELS: Record<string, string> = {
  ja: '日本語',
  en: 'English',
};

export function createInitialProgressEvent(
  command: ChatCommand & { type: 'create_slide_presentation' },
): ProgressSummaryEvent {
  const audienceLabel = command.audience
    ? (AUDIENCE_LABELS[command.audience] ?? command.audience)
    : '未指定';
  const purposeLabel = command.purpose
    ? (PURPOSE_LABELS[command.purpose] ?? command.purpose)
    : '未指定';
  const slideCountLabel =
    command.slideCount == null || command.slideCount === 'auto'
      ? '自動'
      : String(command.slideCount);
  const durationLabel =
    command.durationMinutes == null || command.durationMinutes === 'auto'
      ? '自動'
      : `${command.durationMinutes}分`;
  const languageLabel = command.language
    ? (LANGUAGE_LABELS[command.language] ?? command.language)
    : '日本語';

  return {
    type: 'progress_summary',
    phase: 'request_understanding',
    title: '依頼内容を整理しました',
    summary: `${command.topic} のスライド資料として作成します。`,
    details: [
      `対象読者: ${audienceLabel}`,
      `目的: ${purposeLabel}`,
      `スライド枚数: ${slideCountLabel}`,
      `発表時間: ${durationLabel}`,
      `言語: ${languageLabel}`,
      '出力形式: PPTX',
    ],
    timestamp: new Date().toISOString(),
  };
}

export const SIMULATED_SLIDE_PROGRESS_EVENTS: Omit<ProgressSummaryEvent, 'timestamp'>[] =
  [
    {
      type: 'progress_summary',
      phase: 'router_handoff',
      title: 'スライド作成エージェントに委譲しています',
      summary: '通常回答ではなく、PowerPoint生成フローとして処理します。',
    },
    {
      type: 'progress_summary',
      phase: 'outline',
      title: '資料構成を作成しています',
      summary: '表紙、要約、本文、アクションプランを含む構成を検討しています。',
    },
    {
      type: 'progress_summary',
      phase: 'authoring',
      title: 'スライド本文とレイアウトを作成しています',
      summary: '編集可能なPowerPointとして生成する準備をしています。',
    },
    {
      type: 'progress_summary',
      phase: 'pptx_generation',
      title: 'PPTXを生成しています',
      summary: 'PowerPointファイルを作成しています。',
    },
    {
      type: 'progress_summary',
      phase: 'rendering',
      title: 'スライドを確認しています',
      summary: '生成したスライドを画像化して確認しています。',
    },
    {
      type: 'progress_summary',
      phase: 'diagnostics',
      title: '表示崩れを確認しています',
      summary: '文字あふれやレイアウト崩れを確認しています。',
    },
    {
      type: 'progress_summary',
      phase: 'upload',
      title: 'ダウンロードリンクを準備しています',
      summary: '生成したPPTXをアップロードしています。',
    },
  ];

export const SIMULATED_ERROR_EVENT: Omit<ProgressSummaryEvent, 'timestamp'> = {
  type: 'progress_summary',
  phase: 'error',
  title: 'スライド作成に失敗しました',
  summary: '時間をおいて再試行するか、依頼内容を短くして再度お試しください。',
};

/**
 * Per-step delay in ms for simulated progress events.
 * Earlier steps are slower to spread progress across the full generation time
 * (~60-120s total), avoiding the "upload" step spinning alone for most of it.
 *
 * Total delay before upload step starts: sum of first 6 = ~72s
 */
export const SIMULATED_STEP_DELAYS_MS: number[] = [
  8_000, // router_handoff
  12_000, // outline
  15_000, // authoring
  14_000, // pptx_generation
  12_000, // rendering
  11_000, // diagnostics
  0, // upload (spins until real completion)
];
