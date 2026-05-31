import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  storybookUsersErrorHandler,
  storybookUsersHandler,
  storybookUsersLoadingHandler,
} from '@/mocks/handlers/storybook-handlers';
import { UsersTab } from './users-tab';

const meta = {
  title: 'Admin/UsersTab',
  component: UsersTab,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    msw: { handlers: [storybookUsersHandler] },
  },
  args: {
    from: '2026-05-01',
    to: '2026-05-26',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UsersTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRoles: Story = {
  parameters: {
    docs: {
      description: {
        story:
          '選択期間のアクティブユーザーを表示します。管理者は管理者バッジ、それ以外は一般ユーザーバッジとして表示され、ロールなしのユーザーは一般ユーザーとして扱います。数値列は右寄せで、エラー率は警告・危険の色で表示します。',
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: { handlers: [storybookUsersLoadingHandler] },
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
    msw: { handlers: [storybookUsersErrorHandler] },
    docs: {
      description: {
        story:
          'MSW の 500 ハンドラで API エラーを注入し、DataTable の destructive エラーセルを表示します。',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('ユーザーの読み込みに失敗しました。')).toBeVisible();
  },
};

export const SearchAndClear: Story = {
  name: '検索 → クリアで絞り込みをリセット',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/User ID、ロール/);
    await userEvent.type(input, 'admin');
    const clearButton = await canvas.findByLabelText('検索条件をクリア');
    await userEvent.click(clearButton);
    expect(input).toHaveValue('');
  },
};
