import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UserDetailDrawer } from './user-detail-drawer';

const meta = {
  title: 'Admin/UserDetailDrawer',
  component: UserDetailDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof UserDetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdminUser: Story = {
  args: {
    user: {
      userId: 'user-admin-001-aabbccdd',
      role: 'admin',
      requestCount: 42,
      totalTokens: 15000,
      avgDurationMs: 1200,
      errorRate: 0.02,
      mostUsedAgent: 'research-agent',
      mostUsedTool: 'web_search',
    },
  },
};

export const RegularUser: Story = {
  args: {
    user: {
      userId: 'user-regular-002-eeffgghh',
      role: 'user',
      requestCount: 18,
      totalTokens: 6200,
      avgDurationMs: 850,
      errorRate: 0.0,
      mostUsedAgent: 'chat-agent',
    },
  },
};

export const NoRoleUser: Story = {
  name: 'No Role (defaults to User)',
  args: {
    user: {
      userId: 'user-no-role-004-iijjkkll',
      requestCount: 3,
      totalTokens: 900,
      avgDurationMs: 500,
      errorRate: 0.0,
    },
  },
};

export const Closed: Story = {
  name: 'Closed (user is null)',
  args: {
    user: null,
  },
};
