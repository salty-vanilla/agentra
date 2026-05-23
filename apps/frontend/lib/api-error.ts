import { API_BASE_URL, STREAMING_API_BASE_URL } from './api-config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchMutator<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = [204, 205, 304].includes(res.status) ? null : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, body ? safeParseJson(body) : null);
  }
  return (body ? safeParseJson(body) : {}) as T;
}

// The generated postChat client bakes in NEXT_PUBLIC_API_BASE_URL, but the
// real-mode /chat endpoint lives on the Streaming API. Rewrite the prefix so
// any call to postChat reaches the right backend regardless of mode.
export async function chatFetchMutator<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const rewritten =
    API_BASE_URL !== STREAMING_API_BASE_URL && url.startsWith(API_BASE_URL)
      ? `${STREAMING_API_BASE_URL}${url.slice(API_BASE_URL.length)}`
      : url;
  return fetchMutator<T>(rewritten, options);
}
