import { HttpResponse, http } from 'msw';
import type { ThreadsResponse } from '@/mocks/generated/model';

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
