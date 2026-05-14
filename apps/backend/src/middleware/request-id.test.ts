import { describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from './request-id.js';

describe('requestIdMiddleware', () => {
  it('passes through existing x-request-id header', async () => {
    const requestId = 'existing-request-id-123';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-request-id' || name === 'X-Request-ID') {
            return requestId;
          }
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
    expect(mockContext.header).toHaveBeenCalledWith('x-request-id', requestId);
    expect(nextFn).toHaveBeenCalled();
  });

  it('generates a new ID when header is absent', async () => {
    const mockContext = {
      req: {
        header: vi.fn(() => undefined),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.set).toHaveBeenCalled();
    const [, generatedId] = mockContext.set.mock.calls[0] as [string, string];
    expect(typeof generatedId).toBe('string');
    expect(generatedId.length).toBeGreaterThan(0);

    expect(mockContext.header).toHaveBeenCalledWith('x-request-id', expect.any(String));
    expect(nextFn).toHaveBeenCalled();
  });

  it('sets requestId in context for downstream use', async () => {
    const requestId = 'test-id-456';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-request-id') return requestId;
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
  });

  it('sets x-request-id on response headers', async () => {
    const requestId = 'response-test-789';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-request-id') return requestId;
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.header).toHaveBeenCalledWith('x-request-id', requestId);
  });

  it('trims whitespace from header value', async () => {
    const requestId = 'trimmed-id-123';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-request-id') return `  ${requestId}  `;
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
  });

  it('calls next middleware before setting response headers', async () => {
    const callOrder: string[] = [];
    const mockContext = {
      req: {
        header: vi.fn(() => 'test-id'),
      },
      set: vi.fn(() => {
        callOrder.push('set');
      }),
      header: vi.fn(() => {
        callOrder.push('header');
      }),
    };
    const nextFn = vi.fn(async () => {
      callOrder.push('next');
    });

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(callOrder).toEqual(['set', 'next', 'header']);
  });

  it('checks for case-insensitive header names', async () => {
    const requestId = 'case-insensitive-id';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'X-Request-ID') return requestId;
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    expect(mockContext.set).toHaveBeenCalledWith('requestId', requestId);
  });

  it('generates unique IDs for different requests', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const mockContext = {
        req: {
          header: vi.fn(() => undefined),
        },
        set: vi.fn((key: string, value: string) => {
          if (key === 'requestId') {
            ids.push(value);
          }
        }),
        header: vi.fn(),
      };
      const nextFn = vi.fn();

      await requestIdMiddleware(mockContext as never, nextFn);
    }

    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('prefers x-request-id header over generating new one', async () => {
    const existingId = 'existing-id-from-header';
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'x-request-id' || name === 'X-Request-ID') {
            return existingId;
          }
          return undefined;
        }),
      },
      set: vi.fn(),
      header: vi.fn(),
    };
    const nextFn = vi.fn();

    await requestIdMiddleware(mockContext as never, nextFn);

    const [, usedId] = mockContext.set.mock.calls[0] as [string, string];
    expect(usedId).toBe(existingId);
  });
});
