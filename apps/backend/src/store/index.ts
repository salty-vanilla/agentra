import type {
  ArtifactManifest,
  ChatObservationSummary,
  PersistedChatMessage,
  ThreadSummary,
} from '@agentra/shared';
import { DynamoStore } from './dynamo-store.js';
import { MemoryStore } from './memory-store.js';

type ChatRole = PersistedChatMessage['role'];

export type CreateThreadInput = {
  title?: string;
  initialMessage?: string;
  userId: string;
};

export interface Store {
  listThreads(userId: string): Promise<ThreadSummary[]>;
  getThread(threadId: string, userId: string): Promise<ThreadSummary | undefined>;
  getThreadMessages(threadId: string): Promise<PersistedChatMessage[]>;
  createThread(input: CreateThreadInput): Promise<ThreadSummary>;
  updateThreadTitle(input: {
    threadId: string;
    userId: string;
    title: string;
  }): Promise<ThreadSummary | undefined>;
  deleteThread(input: {
    threadId: string;
    userId: string;
  }): Promise<ThreadSummary | undefined>;
  appendMessage(input: {
    threadId: string;
    role: Exclude<ChatRole, 'system'>;
    content: string;
    observabilitySummary?: ChatObservationSummary;
    artifactManifest?: ArtifactManifest;
    requestId?: string;
    errorMessage?: string;
    errorStack?: string;
    cancelledAt?: string;
  }): Promise<PersistedChatMessage>;
}

function createStore(): Store {
  if (process.env.STORE_TYPE === 'dynamo') {
    return new DynamoStore();
  }
  return new MemoryStore();
}

const activeStore: Store = createStore();

export const listThreads = (userId: string) => activeStore.listThreads(userId);
export const getThread = (threadId: string, userId: string) =>
  activeStore.getThread(threadId, userId);
export const getThreadMessages = (threadId: string) =>
  activeStore.getThreadMessages(threadId);
export const createThread = (input: CreateThreadInput) => activeStore.createThread(input);
export const updateThreadTitle = (input: {
  threadId: string;
  userId: string;
  title: string;
}) => activeStore.updateThreadTitle(input);
export const deleteThread = (input: { threadId: string; userId: string }) =>
  activeStore.deleteThread(input);
export const appendMessage = (input: {
  threadId: string;
  role: Exclude<ChatRole, 'system'>;
  content: string;
  observabilitySummary?: ChatObservationSummary;
  artifactManifest?: ArtifactManifest;
  requestId?: string;
  errorMessage?: string;
  errorStack?: string;
  cancelledAt?: string;
}) => activeStore.appendMessage(input);
