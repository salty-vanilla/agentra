import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQuery } from '@tanstack/react-query';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SidebarProvider } from '@/components/ui/sidebar';
import { listThreads } from '@/lib/generated/agentra';
import type { ThreadSummary } from '@/lib/generated/model';
import { storybookThreadsHandler } from '@/mocks/handlers/storybook-handlers';
import { ServerThreadSidebar } from './server-thread-sidebar';

const noop = () => {};
const noopAsync = async () => {};

const makeThread = (
  id: string,
  title: string,
  preview?: string,
  updatedAt = '2026-05-24T09:00:00.000Z',
): ThreadSummary => ({
  threadId: id,
  title,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt,
  ...(preview !== undefined ? { preview } : {}),
});

const SAMPLE_THREADS: ThreadSummary[] = [
  makeThread('t-001', 'Storybook デモスレッド', 'MSW を使って API をモックする例です。'),
  makeThread(
    't-002',
    'UI コンポーネント確認',
    'Storybook 上でスレッド一覧の表示を確認します。',
  ),
  makeThread('t-003', 'レスポンシブ表示テスト'),
];

const meta = {
  title: 'Components/ServerThreadSidebar',
  component: ServerThreadSidebar,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <SidebarProvider defaultOpen>
        <div style={{ height: '600px', display: 'flex', width: '100%' }}>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
  args: {
    threads: SAMPLE_THREADS,
    isLoading: false,
    onCreateThread: noop,
    onRenameThread: noopAsync,
    onDeleteThread: noopAsync,
    onSelectThread: noop,
  },
} satisfies Meta<typeof ServerThreadSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelectedThread: Story = {
  args: { selectedThreadId: 't-001' },
};

export const Empty: Story = {
  args: { threads: [] },
};

export const Loading: Story = {
  args: { threads: [], isLoading: true },
};

export const LongList: Story = {
  args: {
    threads: Array.from({ length: 30 }, (_, i) =>
      makeThread(
        `t-long-${i}`,
        `スレッド ${i + 1} — 長いリストのスクロール確認用`,
        `プレビューテキスト ${i + 1}`,
      ),
    ),
  },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <SidebarProvider defaultOpen>
        <div style={{ height: '600px', display: 'flex', width: '320px' }}>
          <Story />
        </div>
      </SidebarProvider>
    ),
  ],
};

function ThreadSidebarWithLiveData() {
  const { data, isLoading } = useQuery({
    queryKey: ['threads', 'storybook-live'],
    queryFn: () => listThreads(),
  });

  return (
    <ServerThreadSidebar
      threads={data?.threads ?? []}
      isLoading={isLoading}
      onCreateThread={noop}
      onRenameThread={noopAsync}
      onDeleteThread={noopAsync}
      onSelectThread={noop}
    />
  );
}

export const WithLiveThreads: Story = {
  render: () => <ThreadSidebarWithLiveData />,
  parameters: {
    msw: {
      handlers: [storybookThreadsHandler],
    },
  },
};

export const DeleteDialogOpen: Story = {
  name: 'Thread delete → confirmation dialog appears',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const moreButton = await canvas.findByLabelText(/Thread actions for Storybook/);
    await userEvent.click(moreButton);
    const body = within(canvasElement.ownerDocument.body);
    const deleteItem = await body.findByRole('menuitem', { name: /Delete/ });
    await userEvent.click(deleteItem);
    await waitFor(async () => {
      expect(await body.findByRole('button', { name: 'Cancel' })).toBeVisible();
      expect(await body.findByRole('button', { name: 'Delete' })).toBeVisible();
    });
  },
};
