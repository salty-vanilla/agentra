import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  applyExperiment,
  type ConsoleCollector,
  collectConsole,
  drainLoaf,
  drainLongTasks,
  EXPERIMENTS,
  type ExperimentName,
  type FrameStats,
  installLoafObserver,
  installLongTaskObserver,
  keepsBodyContent,
  type LoafReport,
  type LongTaskReport,
  MSW_TIMEOUT,
  screenshot,
  startFrameProbe,
  stopFrameProbe,
  summarize,
  type Timing,
} from './helpers/modal-performance';

// Number of open/close cycles measured per (flow, experiment).
const ITERATIONS = 5;
// Sampling window after the shell is visible, to capture the open animation
// settling. A fixed window is intentional here — we are sampling frame rate
// over a known duration, not waiting for a UI state.
const OPEN_SETTLE_MS = 450;
// Scroll smoothness sampling: number of wheel steps and the window per step.
const SCROLL_STEPS = 8;
const SCROLL_STEP_DELAY_MS = 60;
// Typed-input sampling (post-open interaction on a fully-shown dialog).
const TYPE_DELAY_MS = 30;
// Hover cycling between on-dialog controls (post-open interaction).
const HOVER_CYCLES = 6;
const HOVER_STEP_DELAY_MS = 70;
// Per-attempt wait for the modal/drawer shell. A no-op click (virtualized row
// re-render race) is detected by this short timeout and retried — the retry is
// not counted, only the successful attempt's elapsed time is recorded.
const OPEN_ATTEMPT_TIMEOUT = 4_000;
const MAX_OPEN_ATTEMPTS = 4;

const OVERLAY_SELECTOR = '[data-slot$="-overlay"]';

// A target user flow: navigate, ready the page, then open/close a modal/drawer.
type Flow = {
  name: string;
  slug: string;
  route: string;
  // Wait until the page is ready to perform the open action.
  ready: (page: Page) => Promise<void>;
  // Perform the open action for iteration `i` (0-based).
  open: (page: Page, i: number) => Promise<void>;
  // Locator for the modal/drawer shell (title/heading).
  shell: (page: Page) => Locator;
  // Optional locator for body content (e.g. fetched detail) used to measure
  // fetch+render cost separately from the shell.
  content?: (page: Page) => Locator;
  // Optional scrollable container (the drawer/dialog body) used to sample
  // scroll smoothness — a strong signal for backdrop-filter repaint cost.
  scrollTarget?: (page: Page) => Locator;
  // Optional post-open interaction on the fully-shown modal (typing, hovering
  // controls). Used to measure "operating on the dialog feels sluggish".
  interact?: (page: Page) => Promise<void>;
};

const SHEET_CONTENT = '[data-slot="sheet-content"]';

/** Hover back and forth between controls to provoke repaints while open. */
async function hoverCycle(page: Page, targets: Locator[]): Promise<void> {
  if (targets.length === 0) return;
  for (let cycle = 0; cycle < HOVER_CYCLES; cycle++) {
    const target = targets[cycle % targets.length] as Locator;
    await target.hover().catch(() => {});
    await page.waitForTimeout(HOVER_STEP_DELAY_MS);
  }
}

const FLOWS: Flow[] = [
  {
    name: 'User Detail Drawer',
    slug: 'user-detail-drawer',
    route: '/admin/users',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'ユーザー' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
      await expect(page.getByRole('cell', { name: 'user001@example.com' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
    },
    // Click a stable text cell (not the absolutely-positioned virtualized <tr>,
    // which re-renders and makes geometric clicks flaky).
    open: async (page) => {
      await page.getByRole('cell', { name: 'user001@example.com' }).click();
    },
    shell: (page) => page.getByRole('heading', { name: 'ユーザー詳細' }),
    scrollTarget: (page) => page.locator(SHEET_CONTENT),
    interact: (page) =>
      hoverCycle(page, [
        page.getByRole('button', { name: '招待メールを再送' }),
        page.getByRole('button', { name: 'トレースを表示' }),
      ]),
  },
  {
    name: 'Invite User Dialog',
    slug: 'invite-user-dialog',
    route: '/admin/users',
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'ユーザーを招待' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'ユーザーを招待' }).click();
    },
    shell: (page) => page.getByRole('heading', { name: 'ユーザーを招待' }),
    // Type into the email field char-by-char — the most direct "operating on the
    // dialog" interaction, and the one users notice as sluggish.
    interact: async (page) => {
      const email = page.locator('#invite-email');
      await email.click();
      await email.pressSequentially('diagnostic@example.com', { delay: TYPE_DELAY_MS });
    },
  },
  {
    name: 'Trace Detail Drawer',
    slug: 'trace-detail-drawer',
    route: '/admin/observability?tab=traces',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: '可観測性ダッシュボード' }),
      ).toBeVisible({ timeout: MSW_TIMEOUT });
      await expect(page.locator('table tbody tr').first()).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
    },
    // Open a different trace each iteration so react-query detail fetches stay
    // fresh (cache is keyed by traceId) — this exposes fetch+render cost. Click
    // a concrete cell within the row rather than the virtualized <tr> center.
    open: async (page, i) => {
      const rows = page.locator('table tbody tr');
      const count = await rows.count();
      await rows
        .nth(i % count)
        .getByRole('cell')
        .first()
        .click();
    },
    shell: (page) => page.getByRole('heading', { name: 'トレース詳細' }),
    // Body section only renders after the detail query resolves.
    content: (page) => page.getByRole('heading', { name: 'タイムライン' }),
    scrollTarget: (page) => page.locator(SHEET_CONTENT),
    interact: (page) =>
      hoverCycle(page, [
        page.getByRole('button', { name: 'Trace IDをコピー' }),
        page.getByRole('button', { name: 'User IDをコピー' }),
      ]),
  },
  {
    name: 'Delete Confirmation Dialog',
    slug: 'delete-confirmation-dialog',
    route: '/',
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'New Thread' })).toBeVisible({
        timeout: MSW_TIMEOUT,
      });
      await expect(
        page.locator('button[aria-label^="Thread actions"]').first(),
      ).toBeVisible({ timeout: MSW_TIMEOUT });
    },
    open: async (page) => {
      await page.locator('button[aria-label^="Thread actions"]').first().click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
    },
    shell: (page) => page.getByRole('heading', { name: 'Delete Thread' }),
    interact: (page) =>
      hoverCycle(page, [
        page.getByRole('button', { name: 'Cancel' }),
        page.getByRole('button', { name: 'Delete' }),
      ]),
  },
];

/** Press Escape and wait for any lingering overlay to detach. Best-effort. */
async function resetClosed(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});
  await page
    .locator(OVERLAY_SELECTOR)
    .first()
    .waitFor({ state: 'detached', timeout: 2_000 })
    .catch(() => {});
}

/**
 * Open the modal/drawer and return action -> shell-visible elapsed ms. Retries
 * a no-op open (the click landed but nothing mounted) so the harness is stable;
 * only the successful attempt is timed.
 */
async function openAndTime(page: Page, flow: Flow, i: number): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt++) {
    const start = Date.now();
    await flow.open(page, i);
    try {
      await flow.shell(page).waitFor({ state: 'visible', timeout: OPEN_ATTEMPT_TIMEOUT });
      return Date.now() - start;
    } catch (error) {
      lastError = error;
      await resetClosed(page);
    }
  }
  throw lastError;
}

/** Close the modal/drawer via Escape and wait until it (and overlays) are gone. */
async function closeFlow(page: Page, flow: Flow): Promise<void> {
  await page.keyboard.press('Escape');
  await flow.shell(page).waitFor({ state: 'hidden', timeout: MSW_TIMEOUT });
  await page
    .locator(OVERLAY_SELECTOR)
    .first()
    .waitFor({ state: 'detached', timeout: MSW_TIMEOUT })
    .catch(() => {});
}

type Smoothness = {
  open: FrameStats;
  scroll: FrameStats | null;
  interact: FrameStats | null;
};

/**
 * Sample frame smoothness while opening (and settling) the modal/drawer, then —
 * for scrollable bodies — while wheel-scrolling. This captures the "もっさり"
 * (sluggish motion) the time-to-visible metric misses: dropped frames during the
 * open animation and repaint cost (e.g. backdrop-filter) during scroll.
 */
async function measureSmoothness(
  page: Page,
  flow: Flow,
  bodyVisible: boolean,
): Promise<Smoothness> {
  // Open animation + settle window.
  await startFrameProbe(page);
  await flow.open(page, 0);
  await flow.shell(page).waitFor({ state: 'visible', timeout: OPEN_ATTEMPT_TIMEOUT });
  await page.waitForTimeout(OPEN_SETTLE_MS);
  const open = await stopFrameProbe(page);

  // Post-open interaction window (typing / hovering on the fully-shown modal).
  // This isolates the "operating on the dialog feels sluggish" case the open
  // animation cannot explain — the modal is static here, so any jank comes from
  // repaints triggered by the interaction (and how expensive they are under blur).
  // Skipped under minimal-drawer-content (the body controls are hidden).
  let interact: FrameStats | null = null;
  if (flow.interact && bodyVisible) {
    await startFrameProbe(page);
    await flow.interact(page);
    interact = await stopFrameProbe(page);
  }

  // Scroll window (drawers with a scrollable body only).
  let scroll: FrameStats | null = null;
  if (flow.scrollTarget) {
    const target = flow.scrollTarget(page);
    await target.hover().catch(() => {});
    await startFrameProbe(page);
    for (let step = 0; step < SCROLL_STEPS; step++) {
      const direction = step % 4 < 2 ? 1 : -1;
      await page.mouse.wheel(0, 220 * direction);
      await page.waitForTimeout(SCROLL_STEP_DELAY_MS);
    }
    scroll = await stopFrameProbe(page);
  }

  await closeFlow(page, flow);
  return { open, scroll, interact };
}

// One row of collected evidence for the final report.
type Result = {
  flow: string;
  experiment: ExperimentName;
  shell: Timing;
  content: Timing | null;
  openJank: FrameStats;
  interactJank: FrameStats | null;
  scrollJank: FrameStats | null;
  longTasks: LongTaskReport;
  loaf: LoafReport;
  consoleWarnings: number;
  consoleErrors: number;
};

const results: Result[] = [];

test.describe('Modal/drawer performance diagnosis (mock API mode)', () => {
  for (const flow of FLOWS) {
    for (const experiment of EXPERIMENTS) {
      test(`${flow.name} — ${experiment}`, async ({ page }, testInfo) => {
        const consoleCollector: ConsoleCollector = collectConsole(page);
        await installLongTaskObserver(page);
        await installLoafObserver(page);
        await applyExperiment(page, experiment);

        await page.goto(flow.route);
        await flow.ready(page);

        const measureContent = flow.content !== undefined && keepsBodyContent(experiment);

        const shellSamples: number[] = [];
        const contentSamples: number[] = [];
        const longTaskDurations: number[] = [];
        let longTaskSupported = false;

        for (let i = 0; i < ITERATIONS; i++) {
          const shellMs = await openAndTime(page, flow, i);
          shellSamples.push(shellMs);

          if (measureContent && flow.content) {
            const start = Date.now();
            await flow.content(page).waitFor({ state: 'visible', timeout: MSW_TIMEOUT });
            contentSamples.push(shellMs + (Date.now() - start));
          }

          if (i === 0) {
            await screenshot(page, testInfo, `${flow.slug}-${experiment}`);
          }

          const drained = await drainLongTasks(page);
          longTaskSupported = drained.supported;
          longTaskDurations.push(...drained.durationsMs);

          await closeFlow(page, flow);
        }

        // Smoothness pass: sample frame rate during open animation (and scroll).
        const smoothness = await measureSmoothness(
          page,
          flow,
          keepsBodyContent(experiment),
        );
        const loaf = await drainLoaf(page);

        const result: Result = {
          flow: flow.name,
          experiment,
          shell: summarize(shellSamples),
          content: contentSamples.length > 0 ? summarize(contentSamples) : null,
          openJank: smoothness.open,
          interactJank: smoothness.interact,
          scrollJank: smoothness.scroll,
          longTasks: { supported: longTaskSupported, durationsMs: longTaskDurations },
          loaf,
          consoleWarnings: consoleCollector.warnings.length,
          consoleErrors: consoleCollector.errors.length,
        };
        results.push(result);

        await testInfo.attach(`${flow.slug}-${experiment}-result.json`, {
          body: JSON.stringify({ result, console: consoleCollector }, null, 2),
          contentType: 'application/json',
        });

        // Sanity: every measured open must produce a real timing.
        expect(result.shell.samples.length).toBe(ITERATIONS);
      });
    }
  }

  test.afterAll(async () => {
    const outDir = path.join(process.cwd(), 'test-results');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'modal-performance-results.json');
    await fs.writeFile(
      outPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), iterations: ITERATIONS, results },
        null,
        2,
      ),
      'utf-8',
    );
  });
});
