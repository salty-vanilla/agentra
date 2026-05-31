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
// Generated screenshots are review artifacts only and must NOT be committed.
// Attach the contact sheet to the PR conversation instead.
//
// Usage (dev server must already be running in mock mode):
//   node scripts/issue-354-capture.mjs [--out <dir>]
//   CAPTURE_BASE_URL=http://127.0.0.1:3100 node scripts/issue-354-capture.mjs --out /tmp/pr-361
//
// Base URL resolution: CAPTURE_BASE_URL env var, else http://127.0.0.1:3000.
//
// Output dir resolution (first match wins), never under the repo:
//   1. --out <dir> CLI argument
//   2. CAPTURE_OUT environment variable
//   3. default: <os tmpdir>/agentra-issue-354-evidence
// Screenshots are written to <out>/{light,dark}/*.png.
//
// Then montage into contact sheets (ImageMagick):
//   montage "$OUT"/light/*.png -label '%f' -tile 2x -geometry 760x520+8+10 \
//     -background white    -fill black     -title 'Issue #354 — Light' "$OUT"/contact-sheet-light.png
//   montage "$OUT"/dark/*.png  -label '%f' -tile 2x -geometry 760x520+8+10 \
//     -background '#0c0a09' -fill '#e7e5e4' -title 'Issue #354 — Dark'  "$OUT"/contact-sheet-dark.png

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { chromium } from '@playwright/test';

function resolveOutDir() {
  const argIndex = process.argv.indexOf('--out');
  const fromArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  const raw = fromArg ?? process.env.CAPTURE_OUT;
  if (!raw) return resolve(tmpdir(), 'agentra-issue-354-evidence');
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

const OUT_ROOT = resolveOutDir();
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
  console.log(`Output: ${OUT_ROOT}/{light,dark} (review artifact — do not commit)`);
  for (const f of results.filter((r) => !r.ok))
    console.log(`  FAIL ${f.name}: ${f.error}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
