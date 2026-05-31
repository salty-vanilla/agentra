// Visual-evidence capture for the Admin Console responsive detail view
// (Compact / Medium / Expanded layout modes). Reusable across Admin detail UI
// PRs — the Issue/PR number lives in the --out path and the PR comment, not in
// this filename.
//
// Drives a running mock-mode dev server with a real Chromium browser and saves
// six review screenshots, in both light and dark themes:
//
//   01 compact   — list (mobile / narrow viewport)
//   02 compact   — detail (full-screen sheet)
//   03 medium    — list (desktop / laptop)
//   04 medium    — drawer (modal overlay)
//   05 expanded  — unselected (no right panel; list uses full width)
//   06 expanded  — detail panel (non-modal inline side panel)
//
// Generated screenshots are review artifacts only and must NOT be committed.
// Writing under the repository is refused. Attach the contact sheet to the PR
// conversation instead.
//
// Usage (dev server must already be running in mock mode):
//   CAPTURE_BASE_URL=http://127.0.0.1:3166 \
//     node scripts/capture-admin-detail-visual-evidence.mjs --out /tmp/pr-366
//
// Base URL resolution: CAPTURE_BASE_URL env var, else http://127.0.0.1:3000.
//
// Output dir resolution (first match wins), and must be outside the repo:
//   1. --out <dir> CLI argument
//   2. CAPTURE_OUT environment variable
//   3. default: <os tmpdir>/agentra-admin-detail-evidence
// Screenshots are written to <out>/{light,dark}/*.png.

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { chromium } from '@playwright/test';

function repoRoot() {
  try {
    return resolve(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
      }).trim(),
    );
  } catch {
    return resolve(process.cwd());
  }
}

// Screenshots are review artifacts, never committed. Refuse any output path that
// resolves inside the repository so a stray --out cannot leak shots into git.
function assertOutsideRepo(outDir) {
  const rel = relative(repoRoot(), outDir);
  const insideRepo = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  if (insideRepo) {
    throw new Error(
      `Refusing to write screenshots inside the repository: ${outDir}\n` +
        'Screenshots are review artifacts and must not be committed. ' +
        'Pass --out with a path outside the repo (e.g. /tmp/pr-366).',
    );
  }
}

function resolveOutDir() {
  const argIndex = process.argv.indexOf('--out');
  const fromArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  const raw = fromArg ?? process.env.CAPTURE_OUT;
  if (!raw) return resolve(tmpdir(), 'agentra-admin-detail-evidence');
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

const OUT_ROOT = resolveOutDir();
assertOutsideRepo(OUT_ROOT);
const BASE = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:3000';
const T = 20_000;

// Viewports chosen to land squarely inside each layout-mode breakpoint
// (compact < 768px <= medium < 1536px <= expanded).
const COMPACT = { width: 414, height: 896 };
const MEDIUM = { width: 1440, height: 900 };
const EXPANDED = { width: 1920, height: 1080 };

const results = [];

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

async function waitForUsersPage(page) {
  await page.getByRole('heading', { name: 'ユーザー' }).waitFor({ timeout: T });
  await page.locator('table tbody tr').first().waitFor({ timeout: T });
}

async function openDetail(page) {
  await page.locator('table tbody tr').first().click();
  await page.getByRole('heading', { name: 'ユーザー詳細' }).waitFor({ timeout: T });
}

const steps = [
  {
    name: '01-compact-list',
    viewport: COMPACT,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
    },
  },
  {
    name: '02-compact-detail',
    viewport: COMPACT,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
      await openDetail(page);
    },
  },
  {
    name: '03-medium-list',
    viewport: MEDIUM,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
    },
  },
  {
    name: '04-medium-drawer',
    viewport: MEDIUM,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
      await openDetail(page);
    },
  },
  {
    name: '05-expanded-unselected',
    viewport: EXPANDED,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
    },
  },
  {
    name: '06-expanded-panel',
    viewport: EXPANDED,
    run: async (page) => {
      await goto(page, '/admin/users');
      await waitForUsersPage(page);
      await openDetail(page);
    },
  },
];

async function captureStep(page, outDir, step) {
  const label = `${outDir.split('/').pop()}/${step.name}`;
  try {
    await page.setViewportSize(step.viewport);
    await step.run(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, `${step.name}.png`), fullPage: false });
    results.push({ name: label, ok: true });
    console.log(`OK   ${label}`);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0];
    results.push({ name: label, ok: false, error: msg });
    console.log(`FAIL ${label}: ${msg}`);
    try {
      await page.screenshot({
        path: resolve(outDir, `${step.name}.png`),
        fullPage: false,
      });
    } catch {}
  }
}

async function runTheme(browser, theme) {
  const outDir = resolve(OUT_ROOT, theme);
  mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: MEDIUM,
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
