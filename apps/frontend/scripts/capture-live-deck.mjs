// Live end-to-end capture: drives the real local Frontend (→ local BFF → ephemeral
// AgentCore) to generate a deck and records the Streaming Deck Preview in action.
//
// Usage: node scripts/capture-live-deck.mjs "<prompt>"

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const PROMPT =
  process.argv[2] ??
  '製造ライン #4 のQ2報告資料を5枚で作成してください。表紙・KPI・課題・対策・まとめの構成で。';
const OUT = new URL(
  '../../../docs/evidence/streaming-deck-preview/live/',
  import.meta.url,
).pathname;
const VIEW = { width: 1280, height: 900 };
// Real generation (LLM + PPTX + SVG export + compose) can take minutes.
const GEN_TIMEOUT_MS = Number(process.env.GEN_TIMEOUT_MS ?? 8 * 60 * 1000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  // Disable web security in THIS capture browser only so it can fetch the
  // ephemeral deck bucket's presigned compose/defs cross-origin (the bucket has
  // no CORS rule for localhost). This is a local capture flag — no infra change.
  const browser = await chromium.launch({
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: VIEW },
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser:error]', m.text());
  });

  console.log('navigate', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

  // Composer textarea — assistant-ui renders a textarea in the composer.
  const composer = page.locator('textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  await page.screenshot({ path: `${OUT}00-loaded.png` });

  await composer.click();
  await composer.fill(PROMPT);
  await page.screenshot({ path: `${OUT}01-prompt.png` });
  // Prefer the explicit Send button; fall back to Enter.
  const sendBtn = page.locator('[aria-label="Send message"]').first();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await composer.press('Enter');
  }
  console.log('submitted prompt; waiting for streaming deck preview…');

  // Poll for the streaming shell, then snapshot as slides reveal.
  const shell = page.locator('[data-testid="streaming-deck-preview"]');
  let shots = 0;
  let polls = 0;
  const startedAt = Date.now();
  let sawShell = false;
  let sawDeck = false;
  while (Date.now() - startedAt < GEN_TIMEOUT_MS) {
    const count = await shell.count().catch(() => 0);
    const visible =
      count > 0 &&
      (await shell
        .first()
        .isVisible()
        .catch(() => false));
    if (visible) {
      sawShell = true;
      const phase = await shell
        .first()
        .getAttribute('data-phase')
        .catch(() => null);
      await page.screenshot({
        path: `${OUT}shell-${String(shots).padStart(2, '0')}-${phase}.png`,
      });
      console.log(`shell shot ${shots} phase=${phase}`);
      shots += 1;
      if (phase === 'completed' || phase === 'failed') break;
    }
    // Heartbeat full-viewport screenshot so the brief shell window is never lost.
    if (polls % 5 === 0) {
      await page.screenshot({ path: `${OUT}poll-${String(polls).padStart(3, '0')}.png` });
    }
    const staticDeck = await page
      .locator('[data-testid="deck-slide-svg"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (staticDeck) sawDeck = true;
    if (!visible && (sawShell || sawDeck) && staticDeck) break;
    polls += 1;
    await sleep(700);
  }
  console.log(`loop end sawShell=${sawShell} shellShots=${shots} polls=${polls}`);

  await sleep(1500);
  await page.screenshot({ path: `${OUT}99-final.png`, fullPage: false });
  console.log(`done. sawShell=${sawShell} shots=${shots}`);
  await ctx.close(); // finalize video
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
