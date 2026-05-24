import { isMockApiMode, STREAMING_API_BASE_URL } from '@/lib/api-config';
import { ApiError } from '@/lib/api-error';
import {
  createThread as createThreadRequest,
  deleteThread as deleteThreadRequest,
  getAdminAgents as getAdminAgentsRequest,
  getAdminOverview as getAdminOverviewRequest,
  getAdminSkills as getAdminSkillsRequest,
  getAdminTools as getAdminToolsRequest,
  getAdminTraceDetail as getAdminTraceDetailRequest,
  getAdminTraces as getAdminTracesRequest,
  getAdminUsers as getAdminUsersRequest,
  getHealth as getHealthRequest,
  listThreadMessages as listThreadMessagesRequest,
  listThreads as listThreadsRequest,
  postChat as postChatRequest,
  updateThread as updateThreadRequest,
} from '@/lib/generated/agentra';
import type {
  AdminAgentsResponse,
  AdminOverviewResponse,
  AdminSkillsResponse,
  AdminToolsResponse,
  AdminTraceDetailResponse,
  AdminTracesResponse,
  AdminUsersResponse,
  ChatObservationSummary,
  ChatRequest,
  ChatStreamDoneEvent,
  ChatStreamErrorEvent,
  ChatStreamObservationEvent,
  ChatStreamProgressSummaryEvent,
  ChatStreamSubAgentProgressEvent,
  ChatStreamTextEvent,
  ChatStreamThreadStartedEvent,
  CreateThreadRequest,
  HealthResponse,
  ObsStatusParameter,
  ThreadMessagesResponse,
  ThreadResponse,
  ThreadsResponse,
  UpdateThreadRequest,
} from '@/lib/generated/model';

export type ChatStreamEvent =
  | ChatStreamThreadStartedEvent
  | ChatStreamTextEvent
  | ChatStreamProgressSummaryEvent
  | ChatStreamSubAgentProgressEvent
  | ChatStreamObservationEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;

export class PrematureSseEofError extends Error {
  constructor() {
    super('SSE stream ended without a terminal event (premature EOF)');
    this.name = 'PrematureSseEofError';
  }
}

export type MockChatResponse = {
  threadId: string;
  reply: string;
  model: string;
  createdAt: string;
  observabilitySummary?: ChatObservationSummary;
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
 * Throws PrematureSseEofError if the stream ends without a terminal done/error event
 * and the caller did not abort.
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

  const response = await fetch(`${STREAMING_API_BASE_URL}/chat`, {
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
  let receivedTerminalEvent = false;

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
          const event = JSON.parse(jsonStr) as ChatStreamEvent;
          if (event.type === 'done' || event.type === 'error') {
            receivedTerminalEvent = true;
          }
          yield event;
        } catch {
          // Ignore malformed SSE data lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!receivedTerminalEvent && !signal?.aborted) {
    throw new PrematureSseEofError();
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
  responsePromise: Promise<ThreadResponse>,
): Promise<ThreadResponse> {
  const response = await responsePromise;
  if (!response || typeof response !== 'object' || !('thread' in response)) {
    throw new ApiError(502, { error: 'Unexpected response shape from thread API.' });
  }
  return response;
}

// ── Admin observability API ───────────────────────────────────────────────────

export type AdminDateRange = { from?: string; to?: string };
export type AdminPaginationParams = AdminDateRange & { limit?: number; cursor?: string };

export async function fetchAdminOverview(
  params: AdminDateRange = {},
): Promise<AdminOverviewResponse> {
  const headers = await getAuthHeaders();
  return getAdminOverviewRequest(params, { headers });
}

export async function fetchAdminUsers(
  params: AdminPaginationParams = {},
): Promise<AdminUsersResponse> {
  const headers = await getAuthHeaders();
  return getAdminUsersRequest(params, { headers });
}

export async function fetchAdminAgents(
  params: AdminDateRange = {},
): Promise<AdminAgentsResponse> {
  const headers = await getAuthHeaders();
  return getAdminAgentsRequest(params, { headers });
}

export async function fetchAdminTools(
  params: AdminDateRange = {},
): Promise<AdminToolsResponse> {
  const headers = await getAuthHeaders();
  return getAdminToolsRequest(params, { headers });
}

export async function fetchAdminSkills(
  params: AdminDateRange = {},
): Promise<AdminSkillsResponse> {
  const headers = await getAuthHeaders();
  return getAdminSkillsRequest(params, { headers });
}

export async function fetchAdminTraces(
  params: AdminPaginationParams & { status?: string; userId?: string } = {},
): Promise<AdminTracesResponse> {
  const headers = await getAuthHeaders();
  const { status, userId, ...rest } = params;
  const tracesParams = {
    ...rest,
    ...(status ? { status: status as ObsStatusParameter } : {}),
    ...(userId ? { userId } : {}),
  };
  return getAdminTracesRequest(tracesParams, { headers });
}

export async function fetchAdminTraceDetail(
  traceId: string,
): Promise<AdminTraceDetailResponse> {
  const headers = await getAuthHeaders();
  return getAdminTraceDetailRequest(traceId, { headers });
}
