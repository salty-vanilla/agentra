import { expect, type Page, type Response, type TestInfo, test } from '@playwright/test';

// MSW browser worker takes a moment to start; this timeout covers that init.
const MSW_TIMEOUT = 15_000;

type Theme = 'light' | 'dark';

const NARROW_VIEWPORT = { width: 414, height: 896 } as const;

function isApiResponse(response: Response, method: string, pathname: string) {
  const url = new URL(response.url());
  return (
    response.request().method() === method && url.pathname === pathname && response.ok()
  );
}

function threadMessagesResponseThreadId(response: Response) {
  const url = new URL(response.url());

  if (response.request().method() !== 'GET' || !response.ok()) {
    return null;
  }

  const match = url.pathname.match(/^\/threads\/([^/]+)\/messages$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

// Pin the next-themes choice before any script runs so the captured surface is
// deterministic regardless of the runner's OS-level color-scheme preference.
async function pinTheme(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('theme', value);
  }, theme);
}

async function waitForWorkspace(page: Page) {
  await expect(page.getByRole('button', { name: 'New Thread' })).toBeVisible({
    timeout: MSW_TIMEOUT,
  });
}

async function waitForNewThread(page: Page) {
  const threadMessagesResponses: Response[] = [];
  const recordThreadMessagesResponse = (response: Response) => {
    if (threadMessagesResponseThreadId(response)) {
      threadMessagesResponses.push(response);
    }
  };

  page.on('response', recordThreadMessagesResponse);

  const threadResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', '/threads'),
    { timeout: MSW_TIMEOUT },
  );

  try {
    await page.getByRole('button', { name: 'New Thread' }).click();

    const threadResponse = await threadResponsePromise;
    const responseBody = (await threadResponse.json()) as {
      thread?: { threadId?: unknown };
    };
    const threadId = responseBody.thread?.threadId;

    if (typeof threadId !== 'string' || threadId.length === 0) {
      throw new Error('Mock thread creation response did not include a threadId.');
    }

    await page.waitForURL((url) => url.searchParams.get('threadId') === threadId, {
      timeout: MSW_TIMEOUT,
    });

    const threadMessagesResponse =
      threadMessagesResponses.find(
        (response) => threadMessagesResponseThreadId(response) === threadId,
      ) ??
      (await page.waitForResponse(
        (response) => threadMessagesResponseThreadId(response) === threadId,
        { timeout: MSW_TIMEOUT },
      ));
    await threadMessagesResponse.finished();

    await expect(page.locator('[data-slot="aui_message-group"] [data-role]')).toHaveCount(
      0,
      {
        timeout: MSW_TIMEOUT,
      },
    );
  } finally {
    page.off('response', recordThreadMessagesResponse);
  }
}

async function sendMessage(page: Page) {
  await waitForNewThread(page);

  const message = 'Hello from visual evidence';
  const composer = page.getByRole('textbox');
  await expect(composer).toBeVisible();
  await composer.fill(message);

  const chatResponsePromise = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', '/chat'),
    { timeout: MSW_TIMEOUT },
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(composer).toHaveValue('', { timeout: MSW_TIMEOUT });
  await chatResponsePromise;
  await expect(
    page.locator('[data-slot="aui_user-message-root"]').filter({ hasText: message }),
  ).toBeVisible({ timeout: MSW_TIMEOUT });
  await expect(page.getByText('サブエージェント実行中')).toBeVisible({
    timeout: MSW_TIMEOUT,
  });
}

function defineThemeSuite(theme: Theme) {
  test.describe(`${theme} mode`, () => {
    test.use({ colorScheme: theme });

    test.beforeEach(async ({ page }) => {
      await pinTheme(page, theme);
    });

    test('chat home (desktop)', async ({ page }, testInfo) => {
      await page.goto('/');
      await waitForWorkspace(page);
      await screenshot(page, testInfo, `chat-home-${theme}`);
    });

    test('assistant message with agent activity', async ({ page }, testInfo) => {
      await page.goto('/');
      await waitForWorkspace(page);
      await sendMessage(page);
      await screenshot(page, testInfo, `chat-send-message-${theme}`);
    });

    test('chat home (narrow)', async ({ page }, testInfo) => {
      await page.setViewportSize(NARROW_VIEWPORT);
      await page.goto('/');
      // The sidebar collapses on narrow widths, so wait for the always-present
      // chat composer rather than the sidebar's New Thread button.
      await expect(page.getByRole('textbox')).toBeVisible({ timeout: MSW_TIMEOUT });
      await screenshot(page, testInfo, `chat-home-narrow-${theme}`);
    });

    test('admin users table', async ({ page }, testInfo) => {
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
      await expect(page.getByRole('button', { name: 'Invite User' })).toBeVisible();
      await expect(page.locator('table tbody tr').first()).toBeVisible();
      await expect(page.getByText(/user-mock-001/i).first()).toBeVisible();
      await screenshot(page, testInfo, `admin-users-${theme}`);
    });

    test('admin user detail drawer', async ({ page }, testInfo) => {
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
      // Click a data cell; the row onClick bubbles up to open the drawer.
      await expect(page.getByRole('cell', { name: 'user001@example.com' })).toBeVisible();
      await page.getByRole('cell', { name: 'user001@example.com' }).click();
      await expect(page.getByRole('heading', { name: 'User Detail' })).toBeVisible();
      await screenshot(page, testInfo, `admin-user-detail-drawer-${theme}`);
    });
  });
}

test.describe('Frontend visual evidence (mock API mode)', () => {
  defineThemeSuite('light');
  defineThemeSuite('dark');
});
