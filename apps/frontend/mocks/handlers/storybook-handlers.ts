import { HttpResponse, http } from 'msw';
import type { AdminUsersResponse, ThreadsResponse } from '@/mocks/generated/model';

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
      userId: 'user-no-role-004',
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
