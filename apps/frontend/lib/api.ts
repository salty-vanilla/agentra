import { API_BASE_URL, isMockApiMode, STREAMING_API_BASE_URL } from '@/lib/api-config';
import { ApiError } from '@/lib/api-error';
import {
  createThread as createThreadRequest,
  deleteKbDocument as deleteKbDocumentRequest,
  deleteThread as deleteThreadRequest,
  getAdminAgents as getAdminAgentsRequest,
  getAdminOverview as getAdminOverviewRequest,
  getAdminSkills as getAdminSkillsRequest,
  getAdminTimeseries as getAdminTimeseriesRequest,
  getAdminTools as getAdminToolsRequest,
  getAdminTraceDetail as getAdminTraceDetailRequest,
  getAdminTraces as getAdminTracesRequest,
  getAdminUsers as getAdminUsersRequest,
  getHealth as getHealthRequest,
  getKbStatus as getKbStatusRequest,
  listKbDocuments as listKbDocumentsRequest,
  listKbIngestionJobs as listKbIngestionJobsRequest,
  listThreadMessages as listThreadMessagesRequest,
  listThreads as listThreadsRequest,
  postChat as postChatRequest,
  presignKbDocument as presignKbDocumentRequest,
  startKbSync as startKbSyncRequest,
  updateThread as updateThreadRequest,
} from '@/lib/generated/agentra';
import type {
  AdminAgentsResponse,
  AdminOverviewResponse,
  AdminSkillsResponse,
  AdminTimeseriesResponse,
  AdminToolsResponse,
  AdminTraceDetailResponse,
  AdminTracesResponse,
  AdminUsersResponse,
  ArtifactManifest,
  ChatObservationSummary,
  ChatRequest,
  ChatStreamArtifactEvent,
  ChatStreamDoneEvent,
  ChatStreamErrorEvent,
  ChatStreamObservationEvent,
  ChatStreamProgressSummaryEvent,
  ChatStreamSubAgentProgressEvent,
  ChatStreamTextEvent,
  ChatStreamThreadStartedEvent,
  CreateThreadRequest,
  HealthResponse,
  IngestionJobsResponse,
  KbDocumentsResponse,
  KbStatusResponse,
  ObsStatusParameter,
  PresignDocumentRequest,
  PresignDocumentResponse,
  SyncResponse,
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
  | ChatStreamArtifactEvent
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
  artifactManifest?: ArtifactManifest;
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
    const bodyText = await response.text().catch(() => '');
    let parsed: unknown = null;
    if (bodyText) {
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = bodyText;
      }
    }
    throw new ApiError(response.status, parsed);
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

export async function fetchArtifactDownloadUrl(
  threadId: string,
  artifactId: string,
): Promise<{ url: string; expiresAt: string }> {
  if (isMockApiMode) {
    const blob = new Blob(['mock pptx artifact'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    return {
      url: URL.createObjectURL(blob),
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
  }
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_BASE_URL}/threads/${encodeURIComponent(threadId)}/artifacts/${encodeURIComponent(artifactId)}/download-url`,
    { headers },
  );
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<{ url: string; expiresAt: string }>;
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

export type AdminTimeseriesParams = AdminDateRange & { bucket?: 'hour' | 'day' };

export async function fetchAdminTimeseries(
  params: AdminTimeseriesParams = {},
): Promise<AdminTimeseriesResponse> {
  const headers = await getAuthHeaders();
  return getAdminTimeseriesRequest(params, { headers });
}

// ── Error classification ──────────────────────────────────────────────────────

export type ChatErrorKind =
  | 'network_disconnect'
  | 'auth_error'
  | 'timeout'
  | 'server_error'
  | 'tool_failure'
  | 'unknown';

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  userMessage: string;
}

const ERROR_MESSAGES: Record<ChatErrorKind, string> = {
  network_disconnect: '接続が切断されました。再試行してください',
  auth_error: 'セッションが切れました。再ログインしてください',
  timeout: '処理がタイムアウトしました。簡単な質問に分割して試してください',
  server_error: 'サーバーエラーが発生しました。しばらく経ってから再試行してください',
  tool_failure: '一部のツール呼び出しが失敗しました。回答が不完全な場合があります',
  unknown:
    'メッセージ送信に失敗しました。バックエンドまたは AgentCore の状態を確認してください',
};

export function classifyChatError(
  error: unknown,
  observabilitySummary?: { toolFailureCount?: number | null } | null,
): ClassifiedChatError {
  let kind: ChatErrorKind;

  if (error instanceof PrematureSseEofError) {
    kind = 'network_disconnect';
  } else if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  ) {
    kind = 'auth_error';
  } else if (error instanceof Error && /timeout/i.test(error.message)) {
    kind = 'timeout';
  } else if (error instanceof ApiError && error.status >= 500) {
    kind = 'server_error';
  } else if ((observabilitySummary?.toolFailureCount ?? 0) > 0) {
    kind = 'tool_failure';
  } else {
    kind = 'unknown';
  }

  return { kind, userMessage: ERROR_MESSAGES[kind] };
}

// ── Knowledge Base API ────────────────────────────────────────────────────────

export async function fetchKbStatus(): Promise<KbStatusResponse> {
  const headers = await getAuthHeaders();
  return getKbStatusRequest({ headers });
}

export async function fetchKbDocuments(nextToken?: string): Promise<KbDocumentsResponse> {
  const headers = await getAuthHeaders();
  return listKbDocumentsRequest(nextToken ? { nextToken } : undefined, { headers });
}

export async function removeKbDocument(key: string): Promise<void> {
  const headers = await getAuthHeaders();
  // Pass raw key — the generated client uses URLSearchParams which encodes automatically
  return deleteKbDocumentRequest({ key }, { headers });
}

export async function presignKbUpload(
  request: PresignDocumentRequest,
): Promise<PresignDocumentResponse> {
  const headers = await getAuthHeaders();
  return presignKbDocumentRequest(request, { headers });
}

export async function fetchKbIngestionJobs(): Promise<IngestionJobsResponse> {
  const headers = await getAuthHeaders();
  return listKbIngestionJobsRequest({ headers });
}

export async function triggerKbSync(): Promise<SyncResponse> {
  const headers = await getAuthHeaders();
  return startKbSyncRequest({ headers });
}
