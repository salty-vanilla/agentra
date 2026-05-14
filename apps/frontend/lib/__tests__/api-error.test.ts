import { describe, expect, it, vi } from 'vitest';
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
