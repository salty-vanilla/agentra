import { expect, type Page, type TestInfo, test } from '@playwright/test';

// MSW browser worker takes a moment to start; this timeout covers that init.
const MSW_TIMEOUT = 15_000;

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('Frontend visual evidence (mock API mode)', () => {
  test('home page', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New Thread' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });
    await screenshot(page, testInfo, 'home');
  });

  test('chat send message flow', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New Thread' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });

    // Open a fresh thread so there are no pre-existing messages.
    // This avoids a race where the initial thread-messages fetch completes
    // while the chat generator is running, causing the runtime to reset
    // the thread with stale data and lose the optimistic user message.
    await page.getByRole('button', { name: 'New Thread' }).click();

    const message = 'Hello from visual evidence';
    const composer = page.getByRole('textbox');
    await expect(composer).toBeVisible();
    await composer.fill(message);
    await screenshot(page, testInfo, 'chat-composer-filled');

    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(composer).toHaveValue('', { timeout: MSW_TIMEOUT });

    // Confirm the user message is visible in the thread area.
    await expect(page.getByText(message).first()).toBeVisible({
      timeout: MSW_TIMEOUT,
    });

    await screenshot(page, testInfo, 'chat-send-message');
  });

  test('admin users table', async ({ page }, testInfo) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });
    await expect(page.getByRole('button', { name: 'Invite User' })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByText(/user-mock-001/i).first()).toBeVisible();
    await screenshot(page, testInfo, 'admin-users');
  });

  test('admin user detail drawer', async ({ page }, testInfo) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });
    // Use the first data cell as click target — the onClick is on the tr and bubbles up.
    await expect(page.getByRole('cell', { name: 'user001@example.com' })).toBeVisible();
    await page.getByRole('cell', { name: 'user001@example.com' }).click();

    await expect(page.getByRole('heading', { name: 'User Detail' })).toBeVisible();
    await screenshot(page, testInfo, 'admin-user-detail-drawer');
  });
});
