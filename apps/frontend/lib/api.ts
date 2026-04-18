import {
  createThread as createThreadRequest,
  deleteThread as deleteThreadRequest,
  getHealth as getHealthRequest,
  listThreadMessages as listThreadMessagesRequest,
  listThreads as listThreadsRequest,
  postChat as postChatRequest,
  updateThread as updateThreadRequest,
} from '@/lib/generated/agentra';
import type {
  ChatRequest,
  ChatResponse,
  CreateThreadRequest,
  ErrorResponse,
  HealthResponse,
  ThreadMessagesResponse,
  ThreadResponse,
  ThreadsResponse,
  UpdateThreadRequest,
} from '@/lib/generated/model';
import { isMockApiMode } from '@/lib/api-config';

async function getAuthHeaders(): Promise<HeadersInit> {
  if (isMockApiMode) return {};
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    // Not authenticated yet — the AuthProvider will redirect
  }
  return {};
}

export async function fetchHealth(): Promise<HealthResponse> {
  return getHealthRequest({
    cache: 'no-store',
  });
}

export async function sendChat(
  request: ChatRequest,
  options?: { signal?: AbortSignal },
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();
  const init: RequestInit = { headers };
  if (options?.signal) init.signal = options.signal;
  return postChatRequest(request, init);
}

export async function fetchThreads(): Promise<ThreadsResponse> {
  const headers = await getAuthHeaders();
  return listThreadsRequest({ cache: 'no-store', headers });
}

export async function fetchThreadMessages(threadId: string): Promise<ThreadMessagesResponse> {
  const headers = await getAuthHeaders();
  return listThreadMessagesRequest(threadId, { cache: 'no-store', headers });
}

export async function createThread(request: CreateThreadRequest = {}): Promise<ThreadResponse> {
  const headers = await getAuthHeaders();
  return expectThreadResponse(createThreadRequest(request, { headers }));
}

export async function updateThreadTitle(
  threadId: string,
  request: UpdateThreadRequest,
): Promise<ThreadResponse> {
  const headers = await getAuthHeaders();
  return expectThreadResponse(updateThreadRequest(threadId, request, { headers }));
}

export async function deleteThreadById(threadId: string): Promise<ThreadResponse> {
  const headers = await getAuthHeaders();
  return expectThreadResponse(deleteThreadRequest(threadId, { headers }));
}

async function expectThreadResponse(
  responsePromise: Promise<ThreadResponse | ErrorResponse>,
): Promise<ThreadResponse> {
  const response = await responsePromise;
  if (!isThreadResponse(response)) {
    throw new Error('Thread operation failed.');
  }
  return response;
}

function isThreadResponse(response: unknown): response is ThreadResponse {
  return !!response && typeof response === 'object' && 'thread' in response;
}
