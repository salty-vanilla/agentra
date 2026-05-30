// Design review capture script for Issue #336.
// Drives the running mock-mode dev server (NEXT_PUBLIC_API_MODE=mock on :3000)
// with a real Chromium browser and saves screenshot evidence for each
// reviewed screen/state at desktop and narrow widths.
//
// Usage (dev server must already be running on 127.0.0.1:3000 in mock mode):
//   node scripts/design-review-capture.mjs
//
// Output: ../../docs/design-review/336/screenshots/*.png

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../docs/design-review/336/screenshots');
const BASE = 'http://127.0.0.1:3000';
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
const T = 20_000;

mkdirSync(OUT_DIR, { recursive: true });

const results = [];

async function capture(page, name, fn, { fullPage = true } = {}) {
  try {
    await fn();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage });
    results.push({ name, ok: true });
    console.log(`OK   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err?.message ?? err).split('\n')[0] });
    console.log(`FAIL ${name}: ${String(err?.message ?? err).split('\n')[0]}`);
    try {
      await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage });
    } catch {}
  }
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

// Chat ready gate: the composer textbox is present on every chat view and only
// mounts after MSW initialises.
async function chatReady(page) {
  await page.getByRole('textbox').first().waitFor({ state: 'visible', timeout: T });
}

// Select a seeded thread by clicking its sidebar title (the ?threadId= query
// param is not honoured for initial selection).
async function openThread(page, title) {
  await goto(page, '/');
  await chatReady(page);
  await page.getByText(title, { exact: true }).first().click();
  await page.waitForTimeout(900);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // ── Chat surfaces (desktop) ───────────────────────────────────────────────
  await capture(page, 'chat-01-home-empty', async () => {
    await page.setViewportSize(DESKTOP);
    await goto(page, '/');
    await chatReady(page);
    await page.getByRole('button', { name: 'New Thread' }).click();
    await page.waitForTimeout(600);
  });

  await capture(page, 'chat-02-conversation', async () => {
    await openThread(page, 'Mock 開発スレッド');
    await page.getByText('backend がなくても').first().waitFor({ timeout: T });
  });

  await capture(page, 'chat-03-agent-activity', async () => {
    await openThread(page, 'Observability バリエーション');
    await page.getByText('複数エージェントが協調').first().waitFor({ timeout: T });
  });

  // Open the Observability detail popover on an assistant message.
  await capture(
    page,
    'chat-04-observability-detail',
    async () => {
      await openThread(page, 'Observability バリエーション');
      await page.getByText('複数エージェントが協調').first().waitFor({ timeout: T });
      const obs = page.getByRole('button', { name: 'Observability' });
      await obs.first().click();
      await page.waitForTimeout(500);
    },
    { fullPage: false },
  );

  await capture(page, 'chat-05-error-states', async () => {
    await openThread(page, 'エラーハンドリング バリエーション');
    await page.getByText('生成に失敗しました').first().waitFor({ timeout: T });
  });

  await capture(page, 'chat-06-artifact', async () => {
    await goto(page, '/');
    await chatReady(page);
    await page.getByRole('button', { name: 'New Thread' }).click();
    await page.waitForTimeout(500);
    const composer = page.getByRole('textbox').first();
    await composer.fill('TypeScriptについての5枚スライドを作成してください');
    await page.getByRole('button', { name: 'Send message' }).first().click();
    await page
      .getByText(/presentation\.pptx/i)
      .first()
      .waitFor({ timeout: T });
  });

  // ── Admin surfaces (desktop) ──────────────────────────────────────────────
  await capture(page, 'admin-01-home', async () => {
    await goto(page, '/admin');
    await page.getByText('Observability').first().waitFor({ timeout: T });
  });

  await capture(page, 'admin-02-observability-overview', async () => {
    await goto(page, '/admin/observability');
    await page.getByRole('tab', { name: 'Overview' }).waitFor({ timeout: T });
    await page.waitForTimeout(900);
  });

  await capture(page, 'admin-03-observability-traces', async () => {
    await goto(page, '/admin/observability?tab=traces');
    await page.getByRole('tab', { name: 'Traces' }).waitFor({ timeout: T });
    await page.locator('table tbody tr').first().waitFor({ timeout: T });
  });

  await capture(
    page,
    'admin-04-trace-detail-drawer',
    async () => {
      await goto(page, '/admin/observability?tab=traces');
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.locator('table tbody tr').first().click();
      await page.waitForTimeout(800);
    },
    { fullPage: false },
  );

  await capture(page, 'admin-05-observability-users', async () => {
    await goto(page, '/admin/observability?tab=users');
    await page.getByRole('tab', { name: 'Users' }).waitFor({ timeout: T });
    await page.waitForTimeout(700);
  });

  await capture(page, 'admin-06-users', async () => {
    await goto(page, '/admin/users');
    await page.getByRole('heading', { name: 'Users' }).waitFor({ timeout: T });
    await page.locator('table tbody tr').first().waitFor({ timeout: T });
  });

  await capture(
    page,
    'admin-07-user-detail-drawer',
    async () => {
      await goto(page, '/admin/users');
      await page
        .getByRole('cell', { name: 'user001@example.com' })
        .first()
        .waitFor({ timeout: T });
      await page.getByRole('cell', { name: 'user001@example.com' }).first().click();
      await page.getByRole('heading', { name: 'User Detail' }).waitFor({ timeout: T });
      await page.waitForTimeout(500);
    },
    { fullPage: false },
  );

  await capture(
    page,
    'admin-08-invite-dialog',
    async () => {
      await goto(page, '/admin/users');
      await page.getByRole('button', { name: 'Invite User' }).waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Invite User' }).click();
      await page.waitForTimeout(700);
    },
    { fullPage: false },
  );

  await capture(page, 'admin-09-users-search-empty', async () => {
    await goto(page, '/admin/users');
    const search = page.getByPlaceholder(/Search/i).first();
    await search.waitFor({ timeout: T });
    await search.fill('zzz-no-such-user-zzz');
    await page.waitForTimeout(900);
  });

  // ── Narrow width ──────────────────────────────────────────────────────────
  await capture(page, 'narrow-01-chat-home', async () => {
    await page.setViewportSize(NARROW);
    await goto(page, '/');
    await chatReady(page);
    await page.waitForTimeout(500);
  });

  await capture(page, 'narrow-02-admin-home', async () => {
    await page.setViewportSize(NARROW);
    await goto(page, '/admin');
    await page.getByText('Observability').first().waitFor({ timeout: T });
  });

  await capture(page, 'narrow-03-admin-users', async () => {
    await page.setViewportSize(NARROW);
    await goto(page, '/admin/users');
    await page.getByRole('heading', { name: 'Users' }).waitFor({ timeout: T });
    await page.waitForTimeout(700);
  });

  await capture(page, 'narrow-04-admin-observability', async () => {
    await page.setViewportSize(NARROW);
    await goto(page, '/admin/observability');
    await page.getByRole('tab', { name: 'Overview' }).waitFor({ timeout: T });
    await page.waitForTimeout(900);
  });

  await page.setViewportSize(DESKTOP);
  await browser.close();

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} captures succeeded.`);
  for (const f of results.filter((r) => !r.ok))
    console.log(`  FAIL ${f.name}: ${f.error}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
