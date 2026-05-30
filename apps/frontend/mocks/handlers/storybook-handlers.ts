import { HttpResponse, http } from 'msw';
import type {
  AdminUsersListResponse,
  AdminUsersResponse,
  ThreadsResponse,
} from '@/mocks/generated/model';

const STORYBOOK_THREADS: ThreadsResponse = {
  threads: [
    {
      threadId: 'story-thread-001',
      title: 'Storybook デモスレッド',
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T09:10:00.000Z',
      preview: 'MSW を使って API をモックする例です。',
    },
    {
      threadId: 'story-thread-002',
      title: 'UI コンポーネント確認',
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:30:00.000Z',
      preview: 'Storybook 上でスレッド一覧の表示を確認します。',
    },
    {
      threadId: 'story-thread-003',
      title: 'レスポンシブ表示テスト',
      createdAt: '2026-05-23T12:00:00.000Z',
      updatedAt: '2026-05-23T12:05:00.000Z',
    },
  ],
};

export const storybookThreadsHandler = http.get('*/threads', () =>
  HttpResponse.json(STORYBOOK_THREADS),
);

export const STORYBOOK_USERS_WITH_ROLES: AdminUsersResponse = {
  users: [
    {
      userId: 'user-admin-001',
      role: 'admin',
      requestCount: 42,
      totalTokens: 15000,
      avgDurationMs: 1200,
      errorRate: 0.02,
      mostUsedAgent: 'research-agent',
      mostUsedTool: 'web_search',
    },
    {
      userId: 'user-regular-002',
      role: 'user',
      requestCount: 18,
      totalTokens: 6200,
      avgDurationMs: 850,
      errorRate: 0.0,
      mostUsedAgent: 'chat-agent',
    },
    {
      userId: 'user-regular-003',
      role: 'user',
      requestCount: 7,
      totalTokens: 2100,
      avgDurationMs: 620,
      errorRate: 0.14,
      mostUsedTool: 'kb_retrieve',
    },
    {
      userId: 'user-high-error-004',
      role: 'user',
      requestCount: 12,
      totalTokens: 3400,
      avgDurationMs: 1600,
      errorRate: 0.333,
      mostUsedAgent: 'research-agent',
      mostUsedTool: 'web_search',
    },
    {
      userId: 'user-no-role-005',
      requestCount: 3,
      totalTokens: 900,
      avgDurationMs: 500,
      errorRate: 0.0,
    },
  ],
};

export const storybookUsersHandler = http.get('*/admin/observability/users', () =>
  HttpResponse.json(STORYBOOK_USERS_WITH_ROLES),
);

export const STORYBOOK_ADMIN_USERS_LIST: AdminUsersListResponse = {
  users: [
    {
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
    },
    {
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
    },
    {
      userId: 'user-no-obs-003-mmnnoopp',
      sub: 'sub-user-003',
      email: 'bob@example.com',
      role: 'user',
      enabled: true,
      createdAt: '2026-03-05T00:00:00.000Z',
    },
    {
      userId: 'user-legacy-004-qqrrsstt',
      sub: 'sub-user-004',
      email: 'carol@example.com',
      role: 'user',
      enabled: false,
      createdAt: '2026-04-01T00:00:00.000Z',
    },
  ],
};

export const storybookAdminUsersListHandler = http.get('*/admin/users', () =>
  HttpResponse.json(STORYBOOK_ADMIN_USERS_LIST),
);

export const storybookInviteAdminUserSuccessHandler = http.post(
  '*/admin/users/invite',
  () =>
    HttpResponse.json(
      {
        email: 'new@example.com',
        role: 'user',
        sub: 'sub-new-abc123',
        userId: 'uid-new-001',
      },
      { status: 201 },
    ),
);

export const storybookInviteAdminUserConflictHandler = http.post(
  '*/admin/users/invite',
  () =>
    HttpResponse.json(
      { error: 'A user with this email already exists' },
      { status: 409 },
    ),
);

export const storybookInviteAdminUserValidationErrorHandler = http.post(
  '*/admin/users/invite',
  () =>
    HttpResponse.json(
      { error: 'Request validation failed against OpenAPI contract.' },
      { status: 400 },
    ),
);

export const storybookInviteAdminUserLoadingHandler = http.post(
  '*/admin/users/invite',
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return HttpResponse.json({ error: 'timeout' }, { status: 504 });
  },
);

const ACTION_SUCCESS_RESPONSE = {
  sub: 'sub-user-002',
  userId: 'user-regular-002-gghhiijjkkll',
  role: 'admin' as const,
  enabled: true,
};

export const storybookPromoteAdminUserSuccessHandler = http.post(
  '*/admin/users/*/promote-admin',
  () => HttpResponse.json(ACTION_SUCCESS_RESPONSE),
);

export const storybookRemoveAdminUserSuccessHandler = http.post(
  '*/admin/users/*/remove-admin',
  () => HttpResponse.json({ ...ACTION_SUCCESS_RESPONSE, role: 'user' as const }),
);

export const storybookRemoveAdminUserConflictHandler = http.post(
  '*/admin/users/*/remove-admin',
  () =>
    HttpResponse.json({ error: 'Cannot remove the last enabled admin' }, { status: 409 }),
);

export const storybookDisableAdminUserSuccessHandler = http.post(
  '*/admin/users/*/disable',
  () =>
    HttpResponse.json({
      ...ACTION_SUCCESS_RESPONSE,
      role: 'user' as const,
      enabled: false,
    }),
);

export const storybookEnableAdminUserSuccessHandler = http.post(
  '*/admin/users/*/enable',
  () => HttpResponse.json({ ...ACTION_SUCCESS_RESPONSE, role: 'user' as const }),
);

export const storybookResendAdminUserInviteSuccessHandler = http.post(
  '*/admin/users/*/resend-invite',
  () =>
    HttpResponse.json({
      sub: 'sub-user-003',
      userId: 'user-no-obs-003-mmnnoopp',
      role: 'user' as const,
      enabled: true,
    }),
);

export const storybookActionLoadingHandler = http.post(
  '*/admin/users/*/(promote-admin|remove-admin|disable|enable|resend-invite)',
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return HttpResponse.json({ error: 'timeout' }, { status: 504 });
  },
);
