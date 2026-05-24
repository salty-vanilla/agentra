import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
};

export const SinglePhase: Story = {
  args: {
    events: [makeEvent('request_understanding', 'リクエスト解析', 'リクエストを解析中')],
    activePhase: 'request_understanding',
  },
};
