import { API_BASE_URL, isMockApiMode } from '@/lib/api-config';
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
  ChatStreamDoneEvent,
  ChatStreamErrorEvent,
  ChatStreamObservationEvent,
  ChatStreamProgressSummaryEvent,
  ChatStreamSubAgentProgressEvent,
  ChatStreamTextEvent,
  CreateThreadRequest,
  ErrorResponse,
  HealthResponse,
  ThreadMessagesResponse,
  ThreadResponse,
  ThreadsResponse,
  UpdateThreadRequest,
} from '@/lib/generated/model';

export type ChatStreamEvent =
  | ChatStreamTextEvent
  | ChatStreamProgressSummaryEvent
  | ChatStreamSubAgentProgressEvent
  | ChatStreamObservationEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;

export type MockChatResponse = {
  threadId: string;
  reply: string;
  model: string;
  createdAt: string;
};

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
): Promise<MockChatResponse> {
  const headers = await getAuthHeaders();
  const init: RequestInit = { headers };
  if (options?.signal) init.signal = options.signal;
  const response = (await postChatRequest(request, init)) as unknown;
  const normalized =
    typeof response === 'string'
      ? (() => {
          try {
            return JSON.parse(response) as unknown;
          } catch {
            return response;
          }
        })()
      : response;

  if (
    normalized &&
    typeof normalized === 'object' &&
    'threadId' in normalized &&
    'reply' in normalized &&
    'model' in normalized &&
    'createdAt' in normalized
  ) {
    return normalized as MockChatResponse;
  }

  throw new Error('Mock chat response is invalid.');
}

/**
 * Streams a chat response from the real backend via SSE.
 * Yields ChatStreamEvent objects as SSE data lines arrive.
 */
export async function* sendChatStream(
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice('data:'.length).trim();
        if (!jsonStr) continue;
        try {
          yield JSON.parse(jsonStr) as ChatStreamEvent;
        } catch {
          // Ignore malformed SSE data lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchThreads(): Promise<ThreadsResponse> {
  const headers = await getAuthHeaders();
  return listThreadsRequest({ cache: 'no-store', headers });
}

export async function fetchThreadMessages(
  threadId: string,
): Promise<ThreadMessagesResponse> {
  const headers = await getAuthHeaders();
  return listThreadMessagesRequest(threadId, { cache: 'no-store', headers });
}

export async function createThread(
  request: CreateThreadRequest = {},
): Promise<ThreadResponse> {
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
