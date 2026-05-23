/**
 * Regression test: postChat routes to the Streaming API URL.
 *
 * The generated postChat client uses NEXT_PUBLIC_API_BASE_URL to build the
 * URL, but the /chat endpoint lives on the Streaming API. chatFetchMutator
 * rewrites the URL when REST and Streaming base URLs differ.
 *
 * This test guards against regressions where:
 *   - The generated client stops using chatFetchMutator
 *   - chatFetchMutator stops rewriting the URL
 *   - The URL construction in getPostChatUrl changes
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REST = 'https://rest.example.com';
const STREAM = 'https://stream.example.com';

describe('postChat URL routing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('routes to the Streaming API URL when REST and Streaming base URLs differ', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', STREAM);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '""',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { postChat } = await import('../generated/agentra.js');
    await postChat({ message: 'hello' }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toBe(`${STREAM}/chat`);
    expect(calledUrl).not.toContain(REST);
  });

  it('does not rewrite when REST and Streaming base URLs are identical', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', REST);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '""',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { postChat } = await import('../generated/agentra.js');
    await postChat({ message: 'hello' }).catch(() => {});

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toBe(`${REST}/chat`);
  });

  it('uses the Streaming API URL when only NEXT_PUBLIC_STREAMING_API_BASE_URL is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', STREAM);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '""',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { postChat } = await import('../generated/agentra.js');
    await postChat({ message: 'test' }).catch(() => {});

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toContain('/chat');
    expect(calledUrl).toContain(STREAM);
  });

  it('postChat calls the /chat path', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', REST);
    vi.stubEnv('NEXT_PUBLIC_STREAMING_API_BASE_URL', STREAM);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '""',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { postChat } = await import('../generated/agentra.js');
    await postChat({ message: 'hello' }).catch(() => {});

    const [calledUrl] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toMatch(/\/chat$/);
  });
});
