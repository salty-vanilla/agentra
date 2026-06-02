import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPythonScript } from '../python-runner.js';
import { isWithinDir } from './path-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Shipped at `<package>/python/compose_slides.py` (see package.json `files`). */
const DEFAULT_SCRIPT_PATH = join(__dirname, '..', '..', 'python', 'compose_slides.py');

const COMPOSE_TIMEOUT_MS = 90_000;

export interface ComposeSvgInput {
  /** Path to the LibreOffice SVG (from {@link exportSvg}). */
  svgPath: string;
  /** Directory to write defs.json + <slug>.compose.json into. */
  outputDir: string;
  /** Slugs for content slides 1..N. Defaults to `slide-N` when omitted. */
  slugs?: string[] | undefined;
  /** Override the script path (tests). */
  scriptPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface ComposeSlideEntry {
  slug: string;
  index: number;
  composePath: string;
}

export interface ComposeSvgResult {
  success: boolean;
  defsPath: string | null;
  slides: ComposeSlideEntry[];
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

interface ScriptSlide {
  slug?: unknown;
  index?: unknown;
  composePath?: unknown;
}

interface ScriptPayload {
  success?: unknown;
  defsPath?: unknown;
  slides?: unknown;
  warnings?: unknown;
  error?: unknown;
}

function parsePayload(stdout: string): ScriptPayload | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value && typeof value === 'object' ? (value as ScriptPayload) : null;
  } catch {
    return null;
  }
}

function normalizeSlides(raw: unknown, outputDir: string): ComposeSlideEntry[] {
  if (!Array.isArray(raw)) return [];
  const slides: ComposeSlideEntry[] = [];
  for (const item of raw as ScriptSlide[]) {
    if (
      item &&
      typeof item.slug === 'string' &&
      typeof item.index === 'number' &&
      typeof item.composePath === 'string' &&
      isWithinDir(item.composePath, outputDir)
    ) {
      slides.push({ slug: item.slug, index: item.index, composePath: item.composePath });
    }
  }
  return slides;
}

/**
 * Split a LibreOffice SVG into `defs.json` + per-slide `<slug>.compose.json`
 * via `python/compose_slides.py`.
 *
 * Never throws: any failure (missing deps, parse error, bad output) returns
 * `success: false` with empty slides and a warning so callers can degrade.
 */
export async function composeSvg(input: ComposeSvgInput): Promise<ComposeSvgResult> {
  const scriptPath = input.scriptPath ?? DEFAULT_SCRIPT_PATH;
  const args = [input.svgPath, '--output_dir', input.outputDir];
  if (input.slugs && input.slugs.length > 0) {
    args.push('--slugs', input.slugs.join(','));
  }

  const result = await runPythonScript({
    scriptPath,
    args,
    timeoutMs: input.timeoutMs ?? COMPOSE_TIMEOUT_MS,
  });

  const warnings: string[] = [];
  const base = {
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };

  if (result.timedOut) {
    warnings.push(
      `compose_slides.py timed out after ${input.timeoutMs ?? COMPOSE_TIMEOUT_MS}ms`,
    );
    return { success: false, defsPath: null, slides: [], ...base, warnings };
  }

  const payload = parsePayload(result.stdout);
  if (!payload) {
    warnings.push(
      `compose_slides.py produced no parseable JSON (exit ${result.exitCode})`,
    );
    return { success: false, defsPath: null, slides: [], ...base, warnings };
  }

  if (payload.success !== true || typeof payload.defsPath !== 'string') {
    const detail = typeof payload.error === 'string' ? payload.error : 'unknown error';
    warnings.push(`compose_slides.py failed: ${detail}`);
    return { success: false, defsPath: null, slides: [], ...base, warnings };
  }

  if (Array.isArray(payload.warnings)) {
    for (const w of payload.warnings) {
      if (typeof w === 'string') warnings.push(w);
    }
  }

  const defsPath = isWithinDir(payload.defsPath, input.outputDir)
    ? payload.defsPath
    : null;
  if (!defsPath) {
    warnings.push(
      `compose_slides.py returned defsPath outside outputDir: ${payload.defsPath}`,
    );
    return { success: false, defsPath: null, slides: [], ...base, warnings };
  }

  return {
    success: true,
    defsPath,
    slides: normalizeSlides(payload.slides, input.outputDir),
    ...base,
    warnings,
  };
}
