// Visual-evidence capture for Issue #354.
// Drives the running mock-mode dev server (NEXT_PUBLIC_API_MODE=mock on :3000)
// with a real Chromium browser and saves screenshots for the screens this issue
// touches, in both light and dark themes:
//
//   1. admin home — disabled "準備中" badges (Part B / L-2 contrast)
//   2. admin users — filtered-empty state with "フィルターをクリア" (Part A / L-1)
//   3. observability users — search-empty with "検索をクリア" (Part A / L-1)
//   4. observability traces — filtered-empty with "フィルターをクリア" (Part A / L-1)
//
// Usage (dev server must already be running on 127.0.0.1:3000 in mock mode):
//   node scripts/issue-354-capture.mjs
//
// Then montage into contact sheets (ImageMagick):
//   montage screenshots/light/*.png -label '%f' -tile 2x -geometry 700x440+8+10 \
//     -background white -fill black -title 'Issue #354 — Light' contact-sheet-light.png
//   montage screenshots/dark/*.png  -label '%f' -tile 2x -geometry 700x440+8+10 \
//     -background '#0c0a09' -fill '#e7e5e4' -title 'Issue #354 — Dark' contact-sheet-dark.png
//
// Output: ../../docs/design-review/354/screenshots/{light,dark}/*.png

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, '../../../docs/design-review/354/screenshots');
const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:3000';
const DESKTOP = { width: 1440, height: 900 };
const T = 20_000;

const results = [];

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

// Wait for the first data row of a virtualized DataTable to mount.
async function firstRow(page) {
  await page.locator('table tbody tr').first().waitFor({ timeout: T });
}

const steps = [
  {
    name: 'admin-01-home-disabled-badges',
    run: async (page) => {
      await goto(page, '/admin');
      await page.getByRole('heading', { name: '管理コンソール' }).waitFor({ timeout: T });
      await page.getByText('準備中').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-02-users-filter-empty',
    run: async (page) => {
      await goto(page, '/admin/users');
      await firstRow(page);
      await page
        .getByPlaceholder('メールアドレス、User ID、Sub、ロールで検索...')
        .fill('zzz-no-such-user-zzz');
      await page
        .getByRole('button', { name: 'フィルターをクリア' })
        .waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-03-observability-users-search-empty',
    run: async (page) => {
      await goto(page, '/admin/observability?tab=users');
      await firstRow(page);
      await page
        .getByPlaceholder('User ID、ロール、上位エージェント、上位ツールで検索...')
        .fill('zzz-no-such-user-zzz');
      await page.getByRole('button', { name: '検索をクリア' }).waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-04-observability-traces-filter-empty',
    run: async (page) => {
      await goto(page, '/admin/observability?tab=traces');
      await firstRow(page);
      await page
        .getByPlaceholder('Trace ID または User ID で検索...')
        .fill('zzz-no-such-trace-zzz');
      await page
        .getByRole('button', { name: 'フィルターをクリア' })
        .waitFor({ timeout: T });
    },
  },
];

async function captureStep(page, outDir, step) {
  const label = `${outDir.split('/').pop()}/${step.name}`;
  try {
    await page.setViewportSize(DESKTOP);
    await step.run(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, `${step.name}.png`), fullPage: true });
    results.push({ name: label, ok: true });
    console.log(`OK   ${label}`);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0];
    results.push({ name: label, ok: false, error: msg });
    console.log(`FAIL ${label}: ${msg}`);
    try {
      await page.screenshot({
        path: resolve(outDir, `${step.name}.png`),
        fullPage: true,
      });
    } catch {}
  }
}

async function runTheme(browser, theme) {
  const outDir = resolve(OUT_ROOT, theme);
  mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  // next-themes reads its persisted choice from localStorage('theme') on mount.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {}
  }, theme);
  const page = await ctx.newPage();

  for (const step of steps) {
    await captureStep(page, outDir, step);
  }
  await ctx.close();
}

const run = async () => {
  const browser = await chromium.launch();
  await runTheme(browser, 'light');
  await runTheme(browser, 'dark');
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
