import { HttpResponse, http } from 'msw';
import { expect, test } from 'vitest';
import { mswServer } from '../msw-server';

test('MSW intercepts fetch in Vitest', async () => {
  mswServer.use(
    http.get('http://localhost/api/test-msw', () => HttpResponse.json({ ok: true })),
  );

  const res = await fetch('http://localhost/api/test-msw');
  const data = await res.json();

  expect(data).toEqual({ ok: true });
});

test('handler reset between tests — previous handler should not leak', async () => {
  // After afterEach resetHandlers(), the handler from the previous test is gone.
  // MSW lets the request fall through to the network, which has nothing listening,
  // so fetch throws a network error rather than returning { ok: true }.
  await expect(fetch('http://localhost/api/test-msw')).rejects.toThrow();
});
