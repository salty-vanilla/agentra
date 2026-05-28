import { expect, test } from '@playwright/test';

// MSW browser worker takes a moment to start; this timeout covers that init.
const MSW_TIMEOUT = 15_000;

test.describe('Frontend smoke (mock API mode)', () => {
  test('top page renders workspace', async ({ page }) => {
    await page.goto('/');

    // "New Thread" button is only rendered after MSW initialises and the
    // workspace mounts — waiting for it acts as an implicit MSW-ready gate.
    await expect(page.getByRole('button', { name: 'New Thread' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });
  });

  test('chat page shows thread list and accepts composer input', async ({ page }) => {
    await page.goto('/');

    // Seeded mock data provides 3 threads; at least one should be listed.
    await expect(
      page.getByRole('button', { name: /Thread actions for/i }).first(),
    ).toBeVisible({ timeout: MSW_TIMEOUT });

    // Composer textarea should be interactive.
    const composer = page.getByRole('textbox');
    await expect(composer).toBeVisible();
    await composer.fill('テスト入力');
    await expect(composer).toHaveValue('テスト入力');
  });

  test('admin users page renders with mock users', async ({ page }) => {
    await page.goto('/admin/users');

    // Page heading confirms the correct page rendered.
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible({
      timeout: MSW_TIMEOUT,
    });

    // "Invite User" button appears only once the page has fully hydrated.
    await expect(page.getByRole('button', { name: 'Invite User' })).toBeVisible();

    // Mock handler returns users; at least one data row must be present.
    // The table is virtualized so only visible rows are in the DOM.
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    // Confirm real mock data is rendered — user-mock-001 is the first userId from MSW.
    await expect(page.getByText(/user-mock-001/i).first()).toBeVisible();
  });
});
