import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { AdminUser } from '@/lib/api';
import {
  STORYBOOK_ADMIN_USERS_LIST,
  storybookAdminUsersListHandler,
  storybookInviteAdminUserConflictHandler,
  storybookInviteAdminUserLoadingHandler,
  storybookInviteAdminUserSuccessHandler,
  storybookInviteAdminUserValidationErrorHandler,
} from '@/mocks/handlers/storybook-handlers';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';
import { AdminUserInviteDialog } from './admin-user-invite-dialog';
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

function InviteDialogWrapper({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        height: '700px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

export const InviteDialogOpen: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUsersPage />
      <AdminUserInviteDialog open={true} onClose={() => {}} />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookInviteAdminUserSuccessHandler],
    },
    docs: { description: { story: 'Invite dialog open with empty form.' } },
  },
};

export const InviteDialogLoading: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUserInviteDialog open={true} onClose={() => {}} />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookInviteAdminUserLoadingHandler],
    },
    docs: { description: { story: 'Invite dialog in pending/loading state.' } },
  },
};

export const InviteDialogConflict: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUserInviteDialog open={true} onClose={() => {}} />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookInviteAdminUserConflictHandler],
    },
    docs: { description: { story: 'Invite dialog showing 409 conflict error.' } },
  },
};

export const InviteDialogValidationError: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUserInviteDialog open={true} onClose={() => {}} />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [
        storybookAdminUsersListHandler,
        storybookInviteAdminUserValidationErrorHandler,
      ],
    },
    docs: { description: { story: 'Invite dialog showing 400 validation error.' } },
  },
};

export const InviteDialogSuccess: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUserInviteDialog
        open={true}
        onClose={() => {}}
        initialSuccessEmail="new@example.com"
      />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: { handlers: [storybookAdminUsersListHandler] },
    docs: { description: { story: '招待成功後の success 表示。' } },
  },
};

export const InviteDialogAdminRole: Story = {
  render: () => (
    <InviteDialogWrapper>
      <AdminUserInviteDialog open={true} onClose={() => {}} defaultRole="admin" />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookInviteAdminUserSuccessHandler],
    },
    docs: { description: { story: 'role=Admin 選択時の warning 表示。' } },
  },
};

export const InviteSubmitSuccess: Story = {
  name: 'Invite dialog — submit shows success state',
  render: () => (
    <InviteDialogWrapper>
      <AdminUsersPage />
      <AdminUserInviteDialog open={true} onClose={() => {}} />
    </InviteDialogWrapper>
  ),
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookInviteAdminUserSuccessHandler],
    },
    docs: {
      description: {
        story:
          '招待フォームにメールを入力→送信→成功表示に遷移することをインタラクションで確認。',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const emailInput = await body.findByLabelText(/メールアドレス/);
    await userEvent.type(emailInput, 'test@example.com');
    const submitButton = await body.findByRole('button', { name: /招待する/ });
    await userEvent.click(submitButton);
    expect(await body.findByText(/招待しました/)).toBeVisible();
  },
};
