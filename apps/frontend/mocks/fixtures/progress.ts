import type { ProgressSummaryEvent } from '@/lib/generated/model';

const FIXED_TIMESTAMP = '2026-05-24T09:00:00.000Z';

function makeEvent(
  phase: ProgressSummaryEvent['phase'],
  title: string,
  summary: string,
  details?: string[],
): ProgressSummaryEvent {
  return {
    type: 'progress_summary',
    phase,
    title,
    summary,
    ...(details !== undefined ? { details } : {}),
    timestamp: FIXED_TIMESTAMP,
  };
}

export const progressFixtures = {
  inProgress: [
    makeEvent('request_understanding', 'リクエスト解析', 'ユーザーのリクエストを解析中'),
    makeEvent('outline', 'アウトライン', 'スライド構成を作成中'),
  ] satisfies ProgressSummaryEvent[],

  complete: [
    makeEvent('request_understanding', 'リクエスト解析', '解析完了', [
      'Tech向け',
      '5スライド構成',
    ]),
    makeEvent('outline', 'アウトライン', '構成完了'),
    makeEvent('authoring', 'コンテンツ生成', '本文生成完了'),
    makeEvent('pptx_generation', 'PPTX生成', 'ファイル生成完了'),
    makeEvent('done', '完了', 'スライド作成が完了しました'),
  ] satisfies ProgressSummaryEvent[],

  withError: [
    makeEvent('request_understanding', 'リクエスト解析', '解析完了'),
    makeEvent('outline', 'アウトライン', '構成完了'),
    makeEvent('error', 'エラー', 'スライド生成に失敗しました'),
  ] satisfies ProgressSummaryEvent[],

  singlePhase: [
    makeEvent('request_understanding', 'リクエスト解析', 'リクエストを解析中'),
  ] satisfies ProgressSummaryEvent[],

  longText: [
    makeEvent(
      'request_understanding',
      'ユーザーリクエストの詳細解析フェーズ（非常に長いタイトルの表示確認用）',
      'ユーザーが入力した複雑なリクエストを解析し、スライドの目的・対象読者・トーン・スライド枚数などの要件を抽出しています。',
      [
        '対象読者: 技術者向け',
        'スライド枚数: 10枚',
        'トーン: フォーマル',
        '言語: 日本語',
      ],
    ),
    makeEvent(
      'outline',
      'スライドアウトライン生成（長い説明テキストの折り返し確認）',
      '抽出した要件に基づいてスライド全体のアウトラインを生成中。各スライドのタイトルと要点を決定します。',
    ),
  ] satisfies ProgressSummaryEvent[],
} as const;
