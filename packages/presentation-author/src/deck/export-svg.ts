import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPythonScript } from '../python-runner.js';
import { isWithinDir } from './path-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Shipped at `<package>/python/export_svg.py` (see package.json `files`). */
const DEFAULT_SCRIPT_PATH = join(__dirname, '..', '..', 'python', 'export_svg.py');

/** soffice conversion timeout, in seconds (passed to the python script). */
const SOFFICE_TIMEOUT_SEC = 90;
/** Outer process timeout, slightly above the soffice timeout so the script
 * reports its own structured error before python-runner force-kills it. */
const RUNNER_TIMEOUT_MS = 100_000;

export interface ExportSvgInput {
  pptxPath: string;
  outputDir: string;
  /** Override the script path (tests). Defaults to the shipped export_svg.py. */
  scriptPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface ExportSvgResult {
  success: boolean;
  svgPath: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

interface ScriptPayload {
  success?: unknown;
  svgPath?: unknown;
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

/**
 * Export a PPTX to a single LibreOffice SVG via `python/export_svg.py`.
 *
 * Never throws: on any failure (soffice missing, timeout, no output, unparseable
 * response) it returns `success: false` with `svgPath: null` and a warning, so
 * callers can degrade (the deck Live Preview is optional; the PPTX always wins).
 */
export async function exportSvg(input: ExportSvgInput): Promise<ExportSvgResult> {
  const scriptPath = input.scriptPath ?? DEFAULT_SCRIPT_PATH;
  const result = await runPythonScript({
    scriptPath,
    args: [
      input.pptxPath,
      '--output_dir',
      input.outputDir,
      '--timeout',
      String(SOFFICE_TIMEOUT_SEC),
    ],
    timeoutMs: input.timeoutMs ?? RUNNER_TIMEOUT_MS,
  });

  const warnings: string[] = [];
  const base = {
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  };

  // A timeout means the process was force-killed; stdout is unreliable, so
  // degrade immediately without also emitting a "no parseable JSON" warning.
  if (result.timedOut) {
    warnings.push(
      `export_svg.py timed out after ${input.timeoutMs ?? RUNNER_TIMEOUT_MS}ms`,
    );
    return { success: false, svgPath: null, ...base, warnings };
  }

  const payload = parsePayload(result.stdout);
  if (!payload) {
    warnings.push(`export_svg.py produced no parseable JSON (exit ${result.exitCode})`);
    return { success: false, svgPath: null, ...base, warnings };
  }

  if (payload.success !== true || typeof payload.svgPath !== 'string') {
    const detail = typeof payload.error === 'string' ? payload.error : 'unknown error';
    warnings.push(`export_svg.py failed: ${detail}`);
    return { success: false, svgPath: null, ...base, warnings };
  }

  // Defense in depth: the script should only ever write inside outputDir.
  if (!isWithinDir(payload.svgPath, input.outputDir)) {
    warnings.push(`export_svg.py returned a path outside outputDir: ${payload.svgPath}`);
    return { success: false, svgPath: null, ...base, warnings };
  }

  return { success: true, svgPath: payload.svgPath, ...base, warnings };
}
