import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import { useState } from 'react';
import type { AdminUser } from '@/lib/api';
import {
  STORYBOOK_ADMIN_USERS_LIST,
  storybookAdminUsersListHandler,
} from '@/mocks/handlers/storybook-handlers';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';
import { AdminUsersPage } from './admin-users-page';

const meta = {
  title: 'Admin/AdminUsersPage',
  component: AdminUsersPage,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    msw: { handlers: [storybookAdminUsersListHandler] },
  },
  decorators: [
    (Story) => (
      <div style={{ height: '700px', display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminUsersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'UserTable-based user list. Admin users show an Admin badge. Users without observability data show dashes for usage columns.',
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [],
    },
    docs: {
      description: { story: 'No MSW handler — request hangs, showing loading state.' },
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [http.get('*/admin/users', () => HttpResponse.json({ users: [] }))],
    },
    docs: {
      description: { story: 'Empty user list.' },
    },
  },
};

export const ApiError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('*/admin/users', () =>
          HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
        ),
      ],
    },
    docs: {
      description: { story: 'API error — shows error message in table area.' },
    },
  },
};

function DrawerOpenWrapper() {
  const [selected, setSelected] = useState<AdminUser | null>(
    STORYBOOK_ADMIN_USERS_LIST.users[0] ?? null,
  );
  return (
    <>
      <AdminUsersPage />
      <AdminUserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </>
  );
}

export const WithDetailDrawerOpen: Story = {
  render: () => <DrawerOpenWrapper />,
  parameters: {
    msw: { handlers: [storybookAdminUsersListHandler] },
    docs: {
      description: {
        story: 'Detail drawer pre-opened for the first user (admin).',
      },
    },
  },
};
