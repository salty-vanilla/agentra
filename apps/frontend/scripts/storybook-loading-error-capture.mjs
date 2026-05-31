// Contact-sheet capture for Issue #353.
// Screenshots the admin-table loading / API-error Storybook stories (served
// statically on :6006) so the DataTable skeleton/spinner and destructive error
// cell become reproducible visual evidence.
//
// Usage (storybook-static must be served on 127.0.0.1:6006):
//   pnpm storybook:serve-static &
//   node scripts/storybook-loading-error-capture.mjs
//
// Output: ../../docs/design-review/353/screenshots/*.png

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../../docs/design-review/353/screenshots');
const BASE = 'http://127.0.0.1:6006';
const VIEWPORT = { width: 900, height: 560 };
const T = 20_000;

const stories = [
  { id: 'admin-tracestab--default', wait: '開始日時', label: 'Traces — loaded' },
  { id: 'admin-tracestab--loading', wait: '読み込み中...', label: 'Traces — loading' },
  {
    id: 'admin-tracestab--api-error',
    wait: 'トレースの読み込みに失敗しました。',
    label: 'Traces — API error',
  },
  { id: 'admin-userstab--loading', wait: '読み込み中...', label: 'Obs. Users — loading' },
  {
    id: 'admin-userstab--api-error',
    wait: 'ユーザーの読み込みに失敗しました。',
    label: 'Obs. Users — API error',
  },
  {
    id: 'admin-adminuserspage--loading',
    wait: '読み込み中...',
    label: 'Admin Users — loading',
  },
  {
    id: 'admin-adminuserspage--api-error',
    wait: 'ユーザーの読み込みに失敗しました。',
    label: 'Admin Users — API error',
  },
];

const results = [];

async function capture(page, story) {
  const url = `${BASE}/iframe.html?id=${story.id}&viewMode=story`;
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.getByText(story.wait, { exact: false }).first().waitFor({ timeout: T });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT_DIR, `${story.id}.png`) });
    results.push({ id: story.id, ok: true });
    console.log(`OK   ${story.id}`);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0];
    results.push({ id: story.id, ok: false, error: msg });
    console.log(`FAIL ${story.id}: ${msg}`);
    await page.screenshot({ path: resolve(OUT_DIR, `${story.id}.png`) }).catch(() => {});
  }
}

const run = async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const story of stories) await capture(page, story);
  await ctx.close();
  await browser.close();

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} captures succeeded.`);
  for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL ${f.id}: ${f.error}`);
  if (okCount < results.length) process.exit(1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
