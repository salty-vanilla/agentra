// Design review capture script for Issue #336.
// Drives the running mock-mode dev server (NEXT_PUBLIC_API_MODE=mock on :3000)
// with a real Chromium browser and saves screenshot evidence for each
// reviewed screen/state, in both light and dark themes, at desktop and narrow
// widths.
//
// Usage (dev server must already be running on 127.0.0.1:3000 in mock mode):
//   node scripts/design-review-capture.mjs
//
// Output: ../../docs/design-review/336/screenshots/{light,dark}/*.png

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(__dirname, '../../../docs/design-review/336/screenshots');
const BASE = 'http://127.0.0.1:3000';
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };
const T = 20_000;

const results = [];

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

// ── Capture steps ───────────────────────────────────────────────────────────
// `widths` controls which viewport(s) the step runs at. Steps default to desktop
// only; narrow-specific steps set widths: ['narrow'].
const steps = [
  // Chat / AI surfaces
  {
    name: 'chat-01-home-empty',
    run: async (page) => {
      await goto(page, '/');
      await chatReady(page);
      await page.getByRole('button', { name: 'New Thread' }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: 'chat-02-conversation',
    run: async (page) => {
      await openThread(page, 'Mock 開発スレッド');
      await page.getByText('backend がなくても').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'chat-03-agent-activity',
    run: async (page) => {
      await openThread(page, 'Observability バリエーション');
      await page.getByText('複数エージェントが協調').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'chat-04-observability-detail',
    fullPage: false,
    run: async (page) => {
      await openThread(page, 'Observability バリエーション');
      await page.getByText('複数エージェントが協調').first().waitFor({ timeout: T });
      // Exact match avoids the sidebar "Thread actions for Observability …" button.
      await page
        .getByRole('button', { name: 'Observability', exact: true })
        .nth(1)
        .click();
      await page.getByRole('menu').first().waitFor({ timeout: T });
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'chat-05-error-states',
    run: async (page) => {
      await openThread(page, 'エラーハンドリング バリエーション');
      await page.getByText('生成に失敗しました').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'chat-06-artifact',
    run: async (page) => {
      await goto(page, '/');
      await chatReady(page);
      await page.getByRole('button', { name: 'New Thread' }).click();
      await page.waitForTimeout(500);
      await page
        .getByRole('textbox')
        .first()
        .fill('TypeScriptについての5枚スライドを作成してください');
      await page.getByRole('button', { name: 'Send message' }).first().click();
      await page
        .getByText(/presentation\.pptx/i)
        .first()
        .waitFor({ timeout: T });
    },
  },
  // Admin / Observability
  {
    name: 'admin-01-home',
    run: async (page) => {
      await goto(page, '/admin');
      await page.getByText('Observability').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-02-observability-overview',
    run: async (page) => {
      await goto(page, '/admin/observability');
      await page.getByRole('tab', { name: 'Overview' }).waitFor({ timeout: T });
      await page.waitForTimeout(900);
    },
  },
  {
    name: 'admin-03-observability-traces',
    run: async (page) => {
      await goto(page, '/admin/observability?tab=traces');
      await page.getByRole('tab', { name: 'Traces' }).waitFor({ timeout: T });
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-04-trace-detail-drawer',
    fullPage: false,
    run: async (page) => {
      await goto(page, '/admin/observability?tab=traces');
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.locator('table tbody tr').first().click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: 'admin-05-observability-users',
    run: async (page) => {
      await goto(page, '/admin/observability?tab=users');
      await page.getByRole('tab', { name: 'Users' }).waitFor({ timeout: T });
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'admin-06-users',
    run: async (page) => {
      await goto(page, '/admin/users');
      await page.getByRole('heading', { name: 'Users' }).waitFor({ timeout: T });
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'admin-07-user-detail-drawer',
    fullPage: false,
    run: async (page) => {
      await goto(page, '/admin/users');
      await page
        .getByRole('cell', { name: 'user001@example.com' })
        .first()
        .waitFor({ timeout: T });
      await page.getByRole('cell', { name: 'user001@example.com' }).first().click();
      await page.getByRole('heading', { name: 'User Detail' }).waitFor({ timeout: T });
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'admin-08-invite-dialog',
    fullPage: false,
    run: async (page) => {
      await goto(page, '/admin/users');
      await page.getByRole('button', { name: 'Invite User' }).waitFor({ timeout: T });
      await page.getByRole('button', { name: 'Invite User' }).click();
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'admin-09-users-search-empty',
    run: async (page) => {
      await goto(page, '/admin/users');
      const search = page.getByPlaceholder(/Search/i).first();
      await search.waitFor({ timeout: T });
      await search.fill('zzz-no-such-user-zzz');
      await page.waitForTimeout(900);
    },
  },
  // Narrow width (responsiveness — theme-independent, captured in light only)
  {
    name: 'narrow-01-chat-home',
    widths: ['narrow'],
    themes: ['light'],
    run: async (page) => {
      await goto(page, '/');
      await chatReady(page);
      await page.waitForTimeout(500);
    },
  },
  {
    name: 'narrow-02-admin-home',
    widths: ['narrow'],
    themes: ['light'],
    run: async (page) => {
      await goto(page, '/admin');
      await page.getByText('Observability').first().waitFor({ timeout: T });
    },
  },
  {
    name: 'narrow-03-admin-users',
    widths: ['narrow'],
    themes: ['light'],
    run: async (page) => {
      await goto(page, '/admin/users');
      await page.getByRole('heading', { name: 'Users' }).waitFor({ timeout: T });
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'narrow-04-admin-observability',
    widths: ['narrow'],
    themes: ['light'],
    run: async (page) => {
      await goto(page, '/admin/observability');
      await page.getByRole('tab', { name: 'Overview' }).waitFor({ timeout: T });
      await page.waitForTimeout(900);
    },
  },
];

async function captureStep(page, outDir, step, width) {
  const fullPage = step.fullPage ?? true;
  try {
    await page.setViewportSize(width === 'narrow' ? NARROW : DESKTOP);
    await step.run(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, `${step.name}.png`), fullPage });
    results.push({ name: `${outDir.split('/').pop()}/${step.name}`, ok: true });
    console.log(`OK   ${outDir.split('/').pop()}/${step.name}`);
  } catch (err) {
    const msg = String(err?.message ?? err).split('\n')[0];
    results.push({
      name: `${outDir.split('/').pop()}/${step.name}`,
      ok: false,
      error: msg,
    });
    console.log(`FAIL ${outDir.split('/').pop()}/${step.name}: ${msg}`);
    try {
      await page.screenshot({ path: resolve(outDir, `${step.name}.png`), fullPage });
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
    const themes = step.themes ?? ['light', 'dark'];
    if (!themes.includes(theme)) continue;
    for (const width of step.widths ?? ['desktop']) {
      await captureStep(page, outDir, step, width);
    }
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
