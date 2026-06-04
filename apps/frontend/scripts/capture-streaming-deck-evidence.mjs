// One-off evidence capture for the Streaming Deck Preview (Epic #403).
// Screenshots every Storybook state + records a video of the incremental reveal.

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'http://localhost:6007/iframe.html';
const OUT = new URL('../../../docs/evidence/streaming-deck-preview/', import.meta.url)
  .pathname;
const VIEW = { width: 460, height: 520 };

const stories = [
  ['planning', 'components-streamingdeckpreview--planning'],
  ['generating-1of3', 'components-streamingdeckpreview--generating-first-slide'],
  ['generating-2of3', 'components-streamingdeckpreview--generating-partial'],
  ['completed', 'components-streamingdeckpreview--completed'],
  ['failed', 'components-streamingdeckpreview--failed'],
  // The existing static DeckPreview, for the hand-off comparison.
  ['static-deckpreview', 'components-deckpreview--multi-slide'],
];

const storyUrl = (id) => `${BASE}?id=${id}&viewMode=story`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 1) Still screenshots of each state.
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 2 });
  for (const [name, id] of stories) {
    await page.goto(storyUrl(id), { waitUntil: 'networkidle' });
    // Let the slide SVG (compose+defs over MSW) build.
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}ui-${name}.png` });
    console.log(`shot ui-${name}.png`);
  }
  await page.close();

  // 2) Video of the incremental reveal: step planning -> 1of3 -> 2of3 -> completed.
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: VIEW },
  });
  const vpage = await ctx.newPage();
  const sequence = [
    'components-streamingdeckpreview--planning',
    'components-streamingdeckpreview--generating-first-slide',
    'components-streamingdeckpreview--generating-partial',
    'components-streamingdeckpreview--completed',
  ];
  for (const id of sequence) {
    await vpage.goto(storyUrl(id), { waitUntil: 'networkidle' });
    await vpage.waitForTimeout(1300); // dwell so each state is visible in the video
  }
  await ctx.close(); // finalizes the .webm
  await browser.close();
  console.log('video written (.webm) to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
