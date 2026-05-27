import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { ProgressSummaryEvent } from '@/lib/generated/model';
import { ProgressSummaryCard } from './progress-summary-card';

const meta = {
  title: 'Components/ProgressSummaryCard',
  component: ProgressSummaryCard,
  tags: ['autodocs'],
} satisfies Meta<typeof ProgressSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const makeEvent = (
  phase: ProgressSummaryEvent['phase'],
  title: string,
  summary: string,
  details?: string[],
): ProgressSummaryEvent => ({
  type: 'progress_summary',
  phase,
  title,
  summary,
  ...(details !== undefined ? { details } : {}),
  timestamp: new Date().toISOString(),
});

export const InProgress: Story = {
  args: {
    events: [
      makeEvent(
        'request_understanding',
        'リクエスト解析',
        'ユーザーのリクエストを解析中',
      ),
      makeEvent('outline', 'アウトライン', 'スライド構成を作成中'),
    ],
    activePhase: 'outline',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/作成中/)).toBeVisible();
  },
};

export const Complete: Story = {
  args: {
    events: [
      makeEvent('request_understanding', 'リクエスト解析', '解析完了', [
        'Tech向け',
        '5スライド構成',
      ]),
      makeEvent('outline', 'アウトライン', '構成完了'),
      makeEvent('authoring', 'コンテンツ生成', '本文生成完了'),
      makeEvent('pptx_generation', 'PPTX生成', 'ファイル生成完了'),
      makeEvent('done', '完了', 'スライド作成が完了しました'),
    ],
  },
};

export const WithError: Story = {
  args: {
    events: [
      makeEvent('request_understanding', 'リクエスト解析', '解析完了'),
      makeEvent('outline', 'アウトライン', '構成完了'),
      makeEvent('error', 'エラー', 'スライド生成に失敗しました'),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/失敗/)).toBeVisible();
  },
};

export const SinglePhase: Story = {
  args: {
    events: [makeEvent('request_understanding', 'リクエスト解析', 'リクエストを解析中')],
    activePhase: 'request_understanding',
  },
};

export const LongText: Story = {
  args: {
    events: [
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
    ],
    activePhase: 'outline',
  },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    events: [
      makeEvent('request_understanding', 'リクエスト解析', '解析完了'),
      makeEvent('outline', 'アウトライン', '構成中'),
    ],
    activePhase: 'outline',
  },
};
