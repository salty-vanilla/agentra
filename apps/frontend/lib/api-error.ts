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
