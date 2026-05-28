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

    const composer = page.getByRole('textbox');
    await expect(composer).toBeVisible();
    await composer.fill('Hello from visual evidence');
    await screenshot(page, testInfo, 'chat-composer-filled');

    // Click the send button and wait for the composer to clear — this confirms
    // the runtime accepted the submission, without depending on where the
    // message text is rendered (which varies by runtime state in CI).
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(composer).toHaveValue('', { timeout: MSW_TIMEOUT });
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
