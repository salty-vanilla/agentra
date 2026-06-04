import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPythonScript } from '../python-runner.js';
import { isWithinDir } from './path-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Shipped at `<package>/python/split_pptx.py` (see package.json `files`). */
const DEFAULT_SCRIPT_PATH = join(__dirname, '..', '..', 'python', 'split_pptx.py');

/** Splitting copies the package per slide; allow generous headroom over export. */
const SPLIT_TIMEOUT_MS = 120_000;

export interface SplitPptxInput {
  /** Path to the fully authored multi-slide PPTX. */
  pptxPath: string;
  /** Directory to write `slide-<n>.pptx` files into. */
  outputDir: string;
  /** Override the script path (tests). Defaults to the shipped split_pptx.py. */
  scriptPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface SplitPptxSlide {
  /** 1-based slide index in source order. */
  index: number;
  /** Absolute path to the single-slide PPTX (always within outputDir). */
  pptxPath: string;
}

export interface SplitPptxResult {
  success: boolean;
  slides: SplitPptxSlide[];
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

interface ScriptSlide {
  index?: unknown;
  pptxPath?: unknown;
}

interface ScriptPayload {
  success?: unknown;
  slides?: unknown;
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

function normalizeSlides(raw: unknown, outputDir: string): SplitPptxSlide[] {
  if (!Array.isArray(raw)) return [];
  const slides: SplitPptxSlide[] = [];
  for (const item of raw as ScriptSlide[]) {
    if (
      item &&
      typeof item.index === 'number' &&
      typeof item.pptxPath === 'string' &&
      isWithinDir(item.pptxPath, outputDir)
    ) {
      slides.push({ index: item.index, pptxPath: item.pptxPath });
    }
  }
  return slides;
}

/**
 * Split a fully authored multi-slide PPTX into ordered single-slide PPTX files
 * via `python/split_pptx.py`, so each slide can be exported/composed/uploaded
 * incrementally (Epic #417 R4 — the per-slide Live Preview pipeline).
 *
 * Never throws: any failure (missing python-pptx, parse error, timeout, no
 * slides) returns `success: false` with empty slides and a warning, so the
 * caller can degrade to the batch deck-preview pipeline.
 */
export async function splitPptx(input: SplitPptxInput): Promise<SplitPptxResult> {
  const scriptPath = input.scriptPath ?? DEFAULT_SCRIPT_PATH;
  const result = await runPythonScript({
    scriptPath,
    args: [input.pptxPath, '--output_dir', input.outputDir],
    timeoutMs: input.timeoutMs ?? SPLIT_TIMEOUT_MS,
  });

  const warnings: string[] = [];
  const base = {
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };

  if (result.timedOut) {
    warnings.push(
      `split_pptx.py timed out after ${input.timeoutMs ?? SPLIT_TIMEOUT_MS}ms`,
    );
    return { success: false, slides: [], ...base, warnings };
  }

  const payload = parsePayload(result.stdout);
  if (!payload) {
    warnings.push(`split_pptx.py produced no parseable JSON (exit ${result.exitCode})`);
    return { success: false, slides: [], ...base, warnings };
  }

  if (payload.success !== true) {
    const detail = typeof payload.error === 'string' ? payload.error : 'unknown error';
    warnings.push(`split_pptx.py failed: ${detail}`);
    return { success: false, slides: [], ...base, warnings };
  }

  const slides = normalizeSlides(payload.slides, input.outputDir);
  if (slides.length === 0) {
    warnings.push('split_pptx.py returned no slides');
    return { success: false, slides: [], ...base, warnings };
  }

  // Keep source order stable regardless of how the script ordered its output.
  slides.sort((a, b) => a.index - b.index);
  return { success: true, slides, ...base, warnings };
}
