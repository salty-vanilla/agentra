'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminUser } from '@/lib/api';
import {
  storybookAdminUsersListHandler,
  storybookDisableAdminUserSuccessHandler,
  storybookEnableAdminUserSuccessHandler,
  storybookPromoteAdminUserSuccessHandler,
  storybookRemoveAdminUserConflictHandler,
  storybookRemoveAdminUserSuccessHandler,
  storybookResendAdminUserInviteSuccessHandler,
} from '@/mocks/handlers/storybook-handlers';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';

const ADMIN_USER: AdminUser = {
  userId: 'user-admin-001-aabbccddeeff',
  sub: 'sub-admin-001',
  email: 'admin@example.com',
  role: 'admin',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  requestCount: 42,
  totalTokens: 15000,
  errorRate: 0.02,
  lastSeenAt: '2026-05-26T12:00:00.000Z',
  mostUsedAgent: 'research-agent',
  mostUsedTool: 'web_search',
};

const REGULAR_USER: AdminUser = {
  userId: 'user-regular-002-gghhiijjkkll',
  sub: 'sub-user-002',
  email: 'alice@example.com',
  role: 'user',
  enabled: true,
  createdAt: '2026-02-10T00:00:00.000Z',
  requestCount: 18,
  totalTokens: 6200,
  errorRate: 0.0,
  lastSeenAt: '2026-05-25T08:00:00.000Z',
};

const DISABLED_USER: AdminUser = {
  userId: 'user-legacy-004-qqrrsstt',
  sub: 'sub-user-004',
  email: 'carol@example.com',
  role: 'user',
  enabled: false,
  createdAt: '2026-04-01T00:00:00.000Z',
};

const meta = {
  title: 'Admin/AdminUserDetailDrawer',
  component: AdminUserDetailDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [storybookAdminUsersListHandler] },
  },
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof AdminUserDetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelfAdminActionsDisabled: Story = {
  name: 'Self Admin — Remove/Disable Buttons Disabled',
  args: {
    // sub matches the isMockApiMode demo-sub so self-action guards fire
    user: { ...ADMIN_USER, sub: 'demo-sub' },
  },
  parameters: {
    docs: {
      description: {
        story:
          '表示中のユーザーが自分自身の場合、管理者権限の削除と無効化ボタンは無効になります。',
      },
    },
  },
};

export const LastAdminRemoveBlocked: Story = {
  name: 'Last Admin — Remove Returns 409',
  args: {
    user: ADMIN_USER,
  },
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookRemoveAdminUserConflictHandler],
    },
    docs: {
      description: {
        story:
          '最後の有効な管理者を削除しようとすると API が 409 を返します。エラートーストが表示され、ドロワーは開いたままになります。',
      },
    },
  },
};

export const DisabledUserActions: Story = {
  name: 'Disabled User — Enable Button Shown',
  args: {
    user: DISABLED_USER,
  },
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookEnableAdminUserSuccessHandler],
    },
    docs: {
      description: {
        story:
          '有効化ボタンが表示され、無効化ボタンは非表示になります。状態バッジは無効を示します。',
      },
    },
  },
};

export const ConfirmPromoteAdmin: Story = {
  name: 'Promote to Admin — Confirmation Dialog',
  args: {
    user: REGULAR_USER,
  },
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookPromoteAdminUserSuccessHandler],
    },
    docs: {
      description: {
        story:
          '管理者に昇格をクリックすると、API 呼び出し前に UserActionConfirmDialog が開きます。',
      },
    },
  },
};

export const ConfirmDisableUser: Story = {
  name: 'Disable User — Destructive Confirmation',
  args: {
    user: REGULAR_USER,
  },
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookDisableAdminUserSuccessHandler],
    },
    docs: {
      description: {
        story: '無効化操作では destructive な確認ダイアログを表示します。',
      },
    },
  },
};

export const ConfirmResendInvite: Story = {
  name: 'Resend Invite — Confirmation with Caveat',
  args: {
    user: {
      userId: 'user-no-obs-003-mmnnoopp',
      sub: 'sub-user-003',
      email: 'bob@example.com',
      role: 'user',
      enabled: true,
      createdAt: '2026-03-05T00:00:00.000Z',
    },
  },
  parameters: {
    msw: {
      handlers: [
        storybookAdminUsersListHandler,
        storybookResendAdminUserInviteSuccessHandler,
      ],
    },
    docs: {
      description: {
        story:
          '招待メール再送ダイアログには「すでにアカウントを有効化済みの場合は失敗することがあります」という注意文を表示します。',
      },
    },
  },
};

export const RemoveAdminSuccess: Story = {
  name: 'Remove Admin — Success',
  args: {
    user: ADMIN_USER,
  },
  parameters: {
    msw: {
      handlers: [storybookAdminUsersListHandler, storybookRemoveAdminUserSuccessHandler],
    },
    docs: {
      description: {
        story: '管理者権限の削除では、確認ダイアログの後に成功トーストを表示します。',
      },
    },
  },
};

export const NoUsageData: Story = {
  name: 'User With No Usage Data',
  args: {
    user: DISABLED_USER,
  },
  parameters: {
    docs: {
      description: {
        story: '可観測性データがないユーザーでは利用状況セクションを非表示にします。',
      },
    },
  },
};

export const Closed: Story = {
  name: 'Closed (user is null)',
  args: {
    user: null,
  },
  parameters: {
    docs: {
      description: {
        story: 'Drawer is closed when user is null.',
      },
    },
  },
};
