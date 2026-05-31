// Visual-evidence capture for the admin-table loading / API-error Storybook
// stories (served statically on :6006), so the DataTable skeleton/spinner and
// destructive error cell become reproducible screenshots.
//
// Generated screenshots are review artifacts only and must not be committed.
// Attach the contact sheet to the PR conversation instead.
//
// Usage (storybook-static must be served on 127.0.0.1:6006):
//   pnpm storybook:serve-static &
//   node scripts/storybook-loading-error-capture.mjs [--out <dir>]
//
// Output dir resolution (first match wins):
//   1. --out <dir> CLI argument
//   2. STORYBOOK_EVIDENCE_OUT environment variable
//   3. default: /tmp/agentra-storybook-loading-error-evidence (outside the repo)
//
// Compose the captured PNGs into a contact sheet with ImageMagick, e.g.:
//   montage "$OUT"/*.png -tile 2x4 -geometry 680x+14+14 "$OUT"/contact-sheet.png

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { chromium } from '@playwright/test';

function resolveOutDir() {
  const argIndex = process.argv.indexOf('--out');
  const fromArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  const raw = fromArg ?? process.env.STORYBOOK_EVIDENCE_OUT;
  if (!raw) return resolve(tmpdir(), 'agentra-storybook-loading-error-evidence');
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

const OUT_DIR = resolveOutDir();
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
  console.log(`Writing review artifacts to ${OUT_DIR} (do not commit these)`);
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
