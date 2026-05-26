import type {
  ArtifactManifest,
  ChatObservationSummary,
  PersistedChatMessage,
  ThreadSummary,
} from '@agentra/shared';
import { uuidv7 } from 'uuidv7';
import type { CreateThreadInput, Store } from './index.js';

type ChatRole = PersistedChatMessage['role'];

const now = () => new Date().toISOString();

function buildThreadTitle(title?: string, fallbackMessage?: string): string {
  if (title?.trim()) {
    return title.trim();
  }

  if (fallbackMessage?.trim()) {
    return fallbackMessage.trim().slice(0, 40);
  }

  return 'New Chat';
}

export class MemoryStore implements Store {
  private threadStore = new Map<string, ThreadSummary & { userId: string }>();
  private messageStore = new Map<string, PersistedChatMessage[]>();

  constructor() {
    this.seed();
  }

  async listThreads(userId: string): Promise<ThreadSummary[]> {
    return Array.from(this.threadStore.values())
      .filter((t) => t.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getThread(threadId: string, userId: string): Promise<ThreadSummary | undefined> {
    const thread = this.threadStore.get(threadId);
    if (!thread || thread.userId !== userId) {
      return undefined;
    }
    return thread;
  }

  async getThreadMessages(threadId: string): Promise<PersistedChatMessage[]> {
    return this.messageStore.get(threadId) ?? [];
  }

  async createThread(input: CreateThreadInput): Promise<ThreadSummary> {
    const timestamp = now();
    const threadId = uuidv7();
    const thread: ThreadSummary & { userId: string } = {
      threadId,
      userId: input.userId,
      title: buildThreadTitle(input.title, input.initialMessage),
      createdAt: timestamp,
      updatedAt: timestamp,
      preview: input.initialMessage,
    };

    this.threadStore.set(threadId, thread);
    this.messageStore.set(threadId, []);

    return thread;
  }

  async updateThreadTitle(input: {
    threadId: string;
    userId: string;
    title: string;
  }): Promise<ThreadSummary | undefined> {
    const existingThread = this.threadStore.get(input.threadId);
    if (!existingThread || existingThread.userId !== input.userId) {
      return undefined;
    }

    const updatedThread: ThreadSummary & { userId: string } = {
      ...existingThread,
      title: input.title.trim(),
      updatedAt: now(),
    };
    this.threadStore.set(input.threadId, updatedThread);
    return updatedThread;
  }

  async deleteThread(input: {
    threadId: string;
    userId: string;
  }): Promise<ThreadSummary | undefined> {
    const existingThread = this.threadStore.get(input.threadId);
    if (!existingThread || existingThread.userId !== input.userId) {
      return undefined;
    }

    this.threadStore.delete(input.threadId);
    this.messageStore.delete(input.threadId);
    return existingThread;
  }

  async appendMessage(input: {
    threadId: string;
    role: Exclude<ChatRole, 'system'>;
    content: string;
    observabilitySummary?: ChatObservationSummary;
    artifactManifest?: ArtifactManifest;
    requestId?: string;
    errorMessage?: string;
    errorStack?: string;
    cancelledAt?: string;
  }): Promise<PersistedChatMessage> {
    const timestamp = now();
    const message: PersistedChatMessage = {
      messageId: uuidv7(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: timestamp,
      ...(input.observabilitySummary
        ? { observabilitySummary: input.observabilitySummary }
        : {}),
      ...(input.artifactManifest ? { artifactManifest: input.artifactManifest } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      ...(input.errorStack ? { errorStack: input.errorStack } : {}),
      ...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
    };

    const currentMessages = this.messageStore.get(input.threadId) ?? [];
    currentMessages.push(message);
    this.messageStore.set(input.threadId, currentMessages);

    const existingThread = this.threadStore.get(input.threadId);
    if (existingThread) {
      this.threadStore.set(input.threadId, {
        ...existingThread,
        updatedAt: timestamp,
        preview: input.content,
        title:
          existingThread.title === 'New Chat'
            ? buildThreadTitle(undefined, input.content)
            : existingThread.title,
      });
    }

    return message;
  }

  private seed() {
    const threadId = '018f3f85-1f27-7b2d-bc95-1234567890ab';
    const createdAt = '2026-04-18T00:05:00.000Z';
    const updatedAt = '2026-04-18T00:06:30.000Z';

    this.threadStore.set(threadId, {
      threadId,
      userId: 'user-demo-001',
      title: '初期構成の確認',
      createdAt,
      updatedAt,
      preview:
        '社内向け Agent チャットの UI、backend、infra を一体で検証するための PoC です。',
    });

    this.messageStore.set(threadId, [
      {
        messageId: 'msg-demo-001',
        threadId,
        role: 'user',
        content: 'この PoC の狙いは？',
        createdAt: '2026-04-18T00:05:20.000Z',
      },
      {
        messageId: 'msg-demo-002',
        threadId,
        role: 'assistant',
        content:
          '社内向け Agent チャットの UI、backend、infra を一体で検証するための PoC です。',
        createdAt: '2026-04-18T00:05:32.000Z',
        observabilitySummary: {
          traceId: 'trace-demo-002',
          startedAt: '2026-04-18T00:05:28.000Z',
          completedAt: '2026-04-18T00:05:32.000Z',
          durationMs: 4000,
          status: 'success',
          tokenUsage: {
            inputTokens: 120,
            outputTokens: 42,
            totalTokens: 162,
          },
          reasoning: {
            stepCount: 2,
            summary: 'Reasoning steps: 2',
          },
          toolCalls: [
            {
              toolCallId: 'date_resolver:demo-001',
              toolName: 'date_resolver',
              startedAt: '2026-04-18T00:05:29.000Z',
              completedAt: '2026-04-18T00:05:29.100Z',
              durationMs: 100,
              status: 'success',
            },
          ],
          toolCallCount: 1,
          toolFailureCount: 0,
        },
      },
    ]);
  }
}
