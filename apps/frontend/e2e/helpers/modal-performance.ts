import type { Page, TestInfo } from '@playwright/test';

// MSW browser worker takes a moment to start; this timeout covers that init.
export const MSW_TIMEOUT = 15_000;

// ── Timing ────────────────────────────────────────────────────────────────

export type Timing = {
  min: number;
  median: number;
  max: number;
  samples: number[];
};

/** Pure min/median/max summary. Does not mutate the input array. */
export function summarize(samples: number[]): Timing {
  if (samples.length === 0) {
    return { min: 0, median: 0, max: 0, samples: [] };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
      : (sorted[mid] as number);
  return {
    min: sorted[0] as number,
    median,
    max: sorted[sorted.length - 1] as number,
    samples: sorted,
  };
}

// ── Long task observation (best-effort) ─────────────────────────────────────

declare global {
  interface Window {
    __longTasks?: number[];
    __longTaskObserverSupported?: boolean;
    __loaf?: { duration: number; blocking: number }[];
    __loafSupported?: boolean;
    __frameDeltas?: number[];
    __frameLast?: number;
    __frameRaf?: number;
  }
}

/**
 * Install a PerformanceObserver for `longtask` entries before app render.
 * Best-effort: if the entry type is unsupported (e.g. some headless configs),
 * it silently records that support was unavailable. Call before page.goto.
 */
export async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__longTaskObserverSupported = false;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longTasks?.push(Math.round(entry.duration));
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      window.__longTaskObserverSupported = true;
    } catch {
      // longtask entry type not supported in this environment.
      window.__longTaskObserverSupported = false;
    }
  });
}

export type LongTaskReport = {
  supported: boolean;
  durationsMs: number[];
};

/** Read accumulated long tasks and reset the buffer for the next iteration. */
export async function drainLongTasks(page: Page): Promise<LongTaskReport> {
  return page.evaluate(() => {
    const supported = window.__longTaskObserverSupported === true;
    const durationsMs = [...(window.__longTasks ?? [])];
    window.__longTasks = [];
    return { supported, durationsMs };
  });
}

// ── Long Animation Frames (LoAF, best-effort) ───────────────────────────────

/**
 * Install a PerformanceObserver for `long-animation-frame` entries. LoAF is a
 * direct signal for "janky"/sluggish frames: it reports frames whose rendering
 * was delayed, plus the blocking script time within them. Best-effort: silently
 * disabled where unsupported. Call before page.goto.
 */
export async function installLoafObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__loaf = [];
    window.__loafSupported = false;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { blockingDuration?: number };
          window.__loaf?.push({
            duration: Math.round(e.duration),
            blocking: Math.round(e.blockingDuration ?? 0),
          });
        }
      });
      observer.observe({ type: 'long-animation-frame', buffered: true });
      window.__loafSupported = true;
    } catch {
      window.__loafSupported = false;
    }
  });
}

export type LoafReport = {
  supported: boolean;
  count: number;
  maxDurationMs: number;
  maxBlockingMs: number;
};

/** Read accumulated LoAF entries and reset the buffer. */
export async function drainLoaf(page: Page): Promise<LoafReport> {
  return page.evaluate(() => {
    const supported = window.__loafSupported === true;
    const frames = [...(window.__loaf ?? [])];
    window.__loaf = [];
    const maxDurationMs = frames.reduce((m, f) => Math.max(m, f.duration), 0);
    const maxBlockingMs = frames.reduce((m, f) => Math.max(m, f.blocking), 0);
    return { supported, count: frames.length, maxDurationMs, maxBlockingMs };
  });
}

// ── Frame probe (rAF-based smoothness during an interaction) ─────────────────

export type FrameStats = {
  frames: number;
  windowMs: number;
  avgFps: number;
  // Frames that took longer than one 60fps budget (>16.7ms) — a dropped frame.
  droppedFrames: number;
  // Frames slower than ~20fps (>50ms) — visible stutter.
  longFrames: number;
  worstFrameMs: number;
};

/** Begin sampling frame-to-frame deltas via requestAnimationFrame. */
export async function startFrameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__frameDeltas = [];
    window.__frameLast = performance.now();
    const tick = (t: number) => {
      const last = window.__frameLast ?? t;
      window.__frameDeltas?.push(t - last);
      window.__frameLast = t;
      window.__frameRaf = requestAnimationFrame(tick);
    };
    window.__frameRaf = requestAnimationFrame(tick);
  });
}

/** Stop sampling and return frame statistics for the window. */
export async function stopFrameProbe(page: Page): Promise<FrameStats> {
  return page.evaluate(() => {
    if (window.__frameRaf !== undefined) cancelAnimationFrame(window.__frameRaf);
    const deltas = window.__frameDeltas ?? [];
    const windowMs = deltas.reduce((sum, d) => sum + d, 0);
    const avgFps = windowMs > 0 ? Math.round((deltas.length / windowMs) * 1000) : 0;
    const droppedFrames = deltas.filter((d) => d > 16.7).length;
    const longFrames = deltas.filter((d) => d > 50).length;
    const worstFrameMs = deltas.reduce((m, d) => Math.max(m, d), 0);
    return {
      frames: deltas.length,
      windowMs: Math.round(windowMs),
      avgFps,
      droppedFrames,
      longFrames,
      worstFrameMs: Math.round(worstFrameMs),
    };
  });
}

// ── Console collection ──────────────────────────────────────────────────────

export type ConsoleEntry = { type: string; text: string };

export type ConsoleCollector = {
  warnings: ConsoleEntry[];
  errors: ConsoleEntry[];
};

/**
 * Attach console + pageerror listeners. Returns a collector whose arrays are
 * populated as warnings/errors occur during the test.
 */
export function collectConsole(page: Page): ConsoleCollector {
  const collector: ConsoleCollector = { warnings: [], errors: [] };
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'warning') collector.warnings.push({ type, text: msg.text() });
    if (type === 'error') collector.errors.push({ type, text: msg.text() });
  });
  page.on('pageerror', (err) => {
    collector.errors.push({ type: 'pageerror', text: err.message });
  });
  return collector;
}

// ── Comparison experiments (diagnostic-only, no production change) ───────────

export type ExperimentName =
  | 'baseline'
  | 'no-backdrop-blur'
  | 'no-animations'
  | 'minimal-drawer-content';

export const EXPERIMENTS: readonly ExperimentName[] = [
  'baseline',
  'no-backdrop-blur',
  'no-animations',
  'minimal-drawer-content',
] as const;

// CSS overrides injected purely from the test. Production components are never
// modified. Targets stable `data-slot` attributes on the Dialog/Sheet primitives.
const EXPERIMENT_CSS: Record<ExperimentName, string | null> = {
  baseline: null,
  'no-backdrop-blur':
    '[data-slot$="-overlay"]{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
  'no-animations':
    '*,*::before,*::after{animation:none !important;transition:none !important;animation-duration:0s !important;transition-duration:0s !important;}',
  // Hide drawer/dialog body to isolate overlay/portal/shell cost, but keep the
  // structural nodes the waits rely on: headers (which contain the title) and
  // the close button stay visible.
  'minimal-drawer-content': [
    '[data-slot="sheet-content"] > *:not([data-slot="sheet-header"]):not([data-slot="sheet-close"]){display:none !important;}',
    '[data-slot="dialog-content"] > *:not([data-slot="dialog-header"]):not([data-slot="dialog-close"]){display:none !important;}',
  ].join(''),
};

/**
 * Whether an experiment leaves modal/drawer body content rendered. The
 * minimal-drawer-content experiment hides the body, so "content visible"
 * (post-fetch) measurements are skipped for it.
 */
export function keepsBodyContent(name: ExperimentName): boolean {
  return name !== 'minimal-drawer-content';
}

/**
 * Inject the experiment's CSS before app render. Call before page.goto so the
 * style is present on first paint for every navigation in the page context.
 */
export async function applyExperiment(page: Page, name: ExperimentName): Promise<void> {
  const css = EXPERIMENT_CSS[name];
  if (!css) return;
  await page.addInitScript((styleText) => {
    const inject = () => {
      const style = document.createElement('style');
      style.setAttribute('data-experiment', 'modal-performance');
      style.textContent = styleText;
      document.head.appendChild(style);
    };
    if (document.head) inject();
    else document.addEventListener('DOMContentLoaded', inject);
  }, css);
}

// ── Screenshots ──────────────────────────────────────────────────────────────

/** Capture a full-page screenshot and attach it to the test report. */
export async function screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
