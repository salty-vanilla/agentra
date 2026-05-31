// Final adoption evidence capture for Issue #362.
//
// After IBM Plex Sans + IBM Plex Sans JP became the app font (app/layout.tsx),
// this drives a running mock-mode dev server with a real Chromium browser and
// captures the five review screens so the adopted typeface can be montaged for
// the PR. No font injection here — the screenshots reflect the real app render.
//
// Usage (mock dev server already running):
//   BASE=http://127.0.0.1:3100 node scripts/font-adoption-capture.mjs
//
// Output (NOT git-managed): /tmp/agentra-font-preview/final/<screen>.png

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const OUT = process.env.OUT ?? '/tmp/agentra-font-preview/final';
const VIEWPORT = { width: 1440, height: 900 };
const T = 40_000;

mkdirSync(OUT, { recursive: true });

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

async function chatReady(page) {
  await page.getByRole('textbox').first().waitFor({ state: 'visible', timeout: T });
}

// IBM Plex Sans JP loads on demand (preload disabled), so make sure the webfont
// has actually painted before the screenshot.
async function fontsReady(page) {
  await page.evaluate(async () => {
    try {
      await document.fonts.load("400 16px 'IBM Plex Sans JP'", 'あ漢字');
      await document.fonts.load("700 16px 'IBM Plex Sans JP'", 'あ漢字');
      await document.fonts.ready;
    } catch {
      /* best effort */
    }
  });
  await page.waitForTimeout(500);
}

const SCREENS = [
  {
    id: 'chat',
    run: async (page) => {
      const PROMPT =
        'AWS Lambda と DynamoDB の構成について、5枚のスライドを作成してください';
      const sendOnce = async () => {
        const box = page.getByRole('textbox').first();
        await box.waitFor({ state: 'visible', timeout: T });
        await box.fill(PROMPT);
        await page.getByRole('button', { name: 'Send message' }).first().click();
      };
      await goto(page, '/');
      await chatReady(page);
      await page.getByRole('button', { name: 'New Thread' }).click();
      await page.waitForTimeout(1000);
      await sendOnce();
      const artifact = page.getByText(/presentation\.pptx/i).first();
      try {
        await artifact.waitFor({ timeout: 130_000 });
      } catch {
        await sendOnce();
        await artifact.waitFor({ timeout: 130_000 });
      }
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    },
  },
  {
    id: 'admin-table',
    run: async (page) => {
      await goto(page, '/admin/users');
      await page
        .getByRole('heading', { name: 'ユーザー' })
        .first()
        .waitFor({ timeout: T });
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'dialog',
    run: async (page) => {
      await goto(page, '/admin/users');
      const trigger = page.getByRole('button', { name: 'ユーザーを招待' });
      await trigger.waitFor({ timeout: T });
      await trigger.click();
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor({ timeout: T });
      await dialog.locator('#invite-email').fill('tanaka.taro@example.com');
      await dialog.locator('#invite-name').fill('山田 太郎');
      await dialog.getByRole('button', { name: '管理者' }).click();
      await page.getByText('この権限を付与すると').first().waitFor({ timeout: T });
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'sidebar-navigation',
    run: async (page) => {
      await goto(page, '/admin');
      await page.getByText('利用状況').first().waitFor({ timeout: T });
      await page.waitForTimeout(400);
    },
  },
  {
    id: 'traces-observability',
    run: async (page) => {
      // ?tab=traces activates the "トレース" tab directly; wait on the table rows.
      await goto(page, '/admin/observability?tab=traces');
      await page.getByRole('tab', { name: 'トレース' }).waitFor({ timeout: T });
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.waitForTimeout(500);
    },
  },
];

const screenFilter = process.env.SCREEN_IDS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const results = [];

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'light');
    } catch {}
  });
  const page = await ctx.newPage();
  const screens = screenFilter
    ? SCREENS.filter((s) => screenFilter.includes(s.id))
    : SCREENS;
  for (const screen of screens) {
    try {
      await page.setViewportSize(VIEWPORT);
      await screen.run(page);
      await fontsReady(page);
      await page.screenshot({ path: resolve(OUT, `${screen.id}.png`), fullPage: false });
      results.push({ id: screen.id, ok: true });
      console.log(`OK   ${screen.id}`);
    } catch (err) {
      const msg = String(err?.message ?? err).split('\n')[0];
      results.push({ id: screen.id, ok: false, error: msg });
      console.log(`FAIL ${screen.id}: ${msg}`);
      try {
        await fontsReady(page);
        await page.screenshot({
          path: resolve(OUT, `${screen.id}.png`),
          fullPage: false,
        });
      } catch {}
    }
  }
  await ctx.close();
  await browser.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} captures succeeded.`);
  for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL ${f.id}: ${f.error}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
