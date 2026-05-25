import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminSidebarView } from './admin-sidebar';

const meta = {
  title: 'Admin/AdminSidebar',
  component: AdminSidebarView,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminSidebarView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdminConsoleActiveRoot: Story = {
  args: { currentPath: '/admin' },
};

export const AdminConsoleActivePath: Story = {
  args: { currentPath: '/admin/console' },
};

export const ObservabilityActive: Story = {
  args: { currentPath: '/admin/observability' },
};

export const UnknownPath: Story = {
  args: { currentPath: '/unknown' },
};

export const DisabledItemPath: Story = {
  args: { currentPath: '/admin/users' },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex', width: '320px' }}>
        <Story />
      </div>
    ),
  ],
  args: { currentPath: '/admin/observability' },
};
