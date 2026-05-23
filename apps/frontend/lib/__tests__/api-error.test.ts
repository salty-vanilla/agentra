import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchMutator } from '../api-error';

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError(400, { error: 'bad request' });
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe('ApiError');
  });

  it('stores status and body', () => {
    const body = { error: 'not found', details: [{ message: 'threadId missing' }] };
    const err = new ApiError(404, body);
    expect(err.status).toBe(404);
    expect(err.body).toEqual(body);
  });

  it('message contains status code', () => {
    const err = new ApiError(503, null);
    expect(err.message).toContain('503');
  });
});

describe('fetchMutator', () => {
  it('returns parsed JSON body on 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            thread: { threadId: 't1', title: 'Hello', createdAt: '', updatedAt: '' },
          }),
      }),
    );

    const result = await fetchMutator('/threads/t1');
    expect(result).toEqual({
      thread: { threadId: 't1', title: 'Hello', createdAt: '', updatedAt: '' },
    });

    vi.unstubAllGlobals();
  });

  it('throws ApiError on 4xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'Thread not found.' }),
      }),
    );

    await expect(fetchMutator('/threads/missing')).rejects.toThrow(ApiError);

    vi.unstubAllGlobals();
  });

  it('ApiError from 4xx contains status and body', async () => {
    const errorBody = {
      error: 'Request validation failed against OpenAPI contract.',
      details: [{ message: 'message is required' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify(errorBody),
      }),
    );

    let caught: unknown;
    try {
      await fetchMutator('/chat');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as ApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.body).toEqual(errorBody);

    vi.unstubAllGlobals();
  });

  it('throws ApiError on 5xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () =>
          JSON.stringify({
            error: 'Response validation failed against OpenAPI contract.',
          }),
      }),
    );

    await expect(fetchMutator('/health')).rejects.toThrow(ApiError);

    vi.unstubAllGlobals();
  });

  it('ErrorResponse.details is preserved as array in ApiError body', async () => {
    const details = [{ instancePath: '/message', message: 'must be string' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Validation failed.', details }),
      }),
    );

    let caught: unknown;
    try {
      await fetchMutator('/chat');
    } catch (err) {
      caught = err;
    }

    const apiErr = caught as ApiError;
    expect(Array.isArray((apiErr.body as { details: unknown }).details)).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe('chatFetchMutator', () => {
  const REST = 'https://rest.example.com';
  const STREAM = 'https://stream.example.com';

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadMutator() {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', STREAM);
    const mod = await import('../api-error');
    return mod.chatFetchMutator;
  }

  it('rewrites the REST base URL to the streaming base URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const chatFetchMutator = await loadMutator();
    await chatFetchMutator(`${REST}/chat`, { method: 'POST' });

    expect(fetchSpy).toHaveBeenCalledWith(`${STREAM}/chat`, { method: 'POST' });
  });

  it('passes through URLs that do not start with the REST base URL', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const chatFetchMutator = await loadMutator();
    const externalUrl = 'https://other.example.com/chat';
    await chatFetchMutator(externalUrl);

    expect(fetchSpy).toHaveBeenCalledWith(externalUrl, undefined);
  });

  it('does not rewrite when REST and streaming base URLs are identical', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', REST);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { chatFetchMutator } = await import('../api-error');
    await chatFetchMutator(`${REST}/chat`);

    expect(fetchSpy).toHaveBeenCalledWith(`${REST}/chat`, undefined);
  });

  it('propagates ApiError from the underlying fetchMutator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'boom' }),
      }),
    );

    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', STREAM);
    const mod = await import('../api-error');
    await expect(mod.chatFetchMutator(`${REST}/chat`)).rejects.toBeInstanceOf(
      mod.ApiError,
    );
  });
});
