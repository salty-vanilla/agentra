import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import {
  storybookTracesErrorHandler,
  storybookTracesHandler,
  storybookTracesLoadingHandler,
} from '@/mocks/handlers/storybook-handlers';
import { TracesTab } from './traces-tab';

const meta = {
  title: 'Admin/TracesTab',
  component: TracesTab,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    msw: { handlers: [storybookTracesHandler] },
  },
  args: {
    from: '2026-05-01',
    to: '2026-05-26',
    onSelectTrace: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TracesTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '選択期間のトレース一覧。状態フィルタと Trace ID / User ID 検索で絞り込めます。',
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: { handlers: [storybookTracesLoadingHandler] },
    docs: {
      description: {
        story:
          'MSW の遅延ハンドラでリクエストを保留し、DataTable の読み込み（スピナー）状態を安定して表示します。',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('読み込み中...')).toBeVisible();
  },
};

export const ApiError: Story = {
  parameters: {
    msw: { handlers: [storybookTracesErrorHandler] },
    docs: {
      description: {
        story:
          'MSW の 500 ハンドラで API エラーを注入し、DataTable の destructive エラーセルを表示します。',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('トレースの読み込みに失敗しました。')).toBeVisible();
  },
};
