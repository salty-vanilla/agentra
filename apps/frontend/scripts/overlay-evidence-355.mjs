// Overlay elevation evidence capture for Issue #355.
// Drives the running mock-mode dev server with a real Chromium browser and
// saves screenshots of the centered Dialog and the Sheet drawers in both
// light and dark themes, so the strengthened scrim + panel border/shadow can
// be verified at a glance (and light mode confirmed un-regressed).
//
// Generated screenshots are review artifacts only and must not be committed.
// Attach the montaged contact sheet to the PR conversation instead.
//
// Usage (mock-mode dev server must be running; port via PORT env, default 3100):
//   PORT=3100 node scripts/overlay-evidence-355.mjs [--out <dir>]
//
// Output dir resolution (first match wins):
//   1. --out <dir> CLI argument
//   2. OVERLAY_EVIDENCE_OUT environment variable
//   3. default: <tmp>/agentra-issue-355-evidence (outside the repo)
// Screenshots land in {light,dark}/*.png under that dir; build the contact
// sheet with:
//   montage "$OUT"/light/*.png "$OUT"/dark/*.png -tile 2x -geometry 640x+10+12 \
//     "$OUT"/contact-sheet.png

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

function resolveOutRoot() {
  const argIndex = process.argv.indexOf('--out');
  const fromArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  const raw = fromArg ?? process.env.OVERLAY_EVIDENCE_OUT;
  if (!raw) return resolve(tmpdir(), 'agentra-issue-355-evidence');
  return resolve(process.cwd(), raw);
}

const OUT_ROOT = resolveOutRoot();
const PORT = process.env.PORT ?? '3100';
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = { width: 1440, height: 900 };
const T = 20_000;

const results = [];

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
}

// Overlay surfaces that exercise the changed Dialog / Sheet components. Captured
// at viewport (fullPage: false) so the scrim dimming the page behind the panel
// is visible in the frame.
const steps = [
  {
    // Centered Dialog (DialogOverlay scrim + DialogContent border/shadow).
    name: 'overlay-01-invite-dialog',
    run: async (page) => {
      await goto(page, '/admin/users');
      const invite = page.getByRole('button', { name: 'ユーザーを招待' });
      await invite.waitFor({ timeout: T });
      await invite.click();
      await page.getByRole('dialog').waitFor({ timeout: T });
      await page.waitForTimeout(700);
    },
  },
  {
    // Sheet drawer from the right (SheetOverlay scrim + SheetContent border/shadow).
    name: 'overlay-02-user-detail-drawer',
    run: async (page) => {
      await goto(page, '/admin/users');
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.locator('table tbody tr').first().click();
      await page.getByRole('heading', { name: 'ユーザー詳細' }).waitFor({ timeout: T });
      await page.waitForTimeout(600);
    },
  },
  {
    // Trace detail drawer (Sheet) — second overlay surface for consistency check.
    name: 'overlay-03-trace-detail-drawer',
    run: async (page) => {
      await goto(page, '/admin/observability?tab=traces');
      await page.locator('table tbody tr').first().waitFor({ timeout: T });
      await page.locator('table tbody tr').first().click();
      await page.waitForTimeout(700);
    },
  },
];

async function captureStep(page, outDir, step) {
  try {
    await step.run(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(outDir, `${step.name}.png`), fullPage: false });
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
    viewport: DESKTOP,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
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
  console.log(`Writing review artifacts to ${OUT_ROOT} (do not commit these)`);
  const browser = await chromium.launch();
  await runTheme(browser, 'light');
  await runTheme(browser, 'dark');
  await browser.close();

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} captures succeeded.`);
  for (const f of results.filter((r) => !r.ok))
    console.log(`  FAIL ${f.name}: ${f.error}`);
  if (okCount < results.length) process.exit(1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
