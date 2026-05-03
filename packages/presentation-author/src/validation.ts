import { dirname, join } from 'node:path';
import { runPythonScript } from './python-runner.js';

// --- Overflow validation ---

export interface ValidatePresentationOverflowInput {
  pptxPath: string;
  scriptsDir?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  timeoutMs?: number | undefined;
}

export interface ValidatePresentationOverflowResult {
  success: boolean;
  passed: boolean;
  overflowSlideNumbers: number[];
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

export async function validatePresentationOverflow(
  input: ValidatePresentationOverflowInput,
): Promise<ValidatePresentationOverflowResult> {
  const pptxDir = dirname(input.pptxPath);
  const scriptsDir = input.scriptsDir ?? join(pptxDir, 'scripts');
  const scriptPath = join(scriptsDir, 'slides_test.py');
  const width = input.width ?? 1600;
  const height = input.height ?? 900;
  const warnings: string[] = [];

  const result = await runPythonScript({
    scriptPath,
    args: [input.pptxPath, '--width', String(width), '--height', String(height)],
    cwd: pptxDir,
    timeoutMs: input.timeoutMs,
  });

  const stdout = result.stdout;

  if (stdout.includes('Test passed. No overflow detected.')) {
    return {
      success: true,
      passed: true,
      overflowSlideNumbers: [],
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  }

  const overflowSlideNumbers = parseOverflowSlides(stdout);
  if (overflowSlideNumbers.length > 0 || stdout.includes('overflowing')) {
    return {
      success: true,
      passed: false,
      overflowSlideNumbers,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  }

  // Infrastructure failure
  if (!result.success) {
    if (result.timedOut) {
      warnings.push('Overflow validation timed out');
    }
    return {
      success: false,
      passed: false,
      overflowSlideNumbers: [],
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings: [...warnings, `slides_test.py failed (exit ${result.exitCode})`],
    };
  }

  return {
    success: true,
    passed: true,
    overflowSlideNumbers: [],
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    warnings,
  };
}

function parseOverflowSlides(stdout: string): number[] {
  // Parse: "Slides with content overflowing original canvas (1-based indexing): 1, 3, 5"
  const match = stdout.match(/Slides with content overflowing[^:]*:\s*([\d,\s]+)/);
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// --- Font detection ---

export interface DetectPresentationFontsInput {
  pptxPath: string;
  scriptsDir?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface DetectPresentationFontsResult {
  success: boolean;
  missingFonts: string[];
  substitutedFonts: string[];
  rawJson?: unknown | undefined;
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

export async function detectPresentationFonts(
  input: DetectPresentationFontsInput,
): Promise<DetectPresentationFontsResult> {
  const pptxDir = dirname(input.pptxPath);
  const scriptsDir = input.scriptsDir ?? join(pptxDir, 'scripts');
  const scriptPath = join(scriptsDir, 'detect_font.py');
  const warnings: string[] = [];

  const result = await runPythonScript({
    scriptPath,
    args: [input.pptxPath, '--json'],
    cwd: pptxDir,
    timeoutMs: input.timeoutMs,
  });

  if (!result.success) {
    if (result.timedOut) {
      warnings.push('Font detection timed out');
    }
    return {
      success: false,
      missingFonts: [],
      substitutedFonts: [],
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings: [...warnings, `detect_font.py failed (exit ${result.exitCode})`],
    };
  }

  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const missingFonts = extractFontList(parsed['font_missing_overall']);
    const substitutedFonts = extractFontList(parsed['font_substituted_overall']);
    return {
      success: true,
      missingFonts,
      substitutedFonts,
      rawJson: parsed,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  } catch {
    warnings.push('Failed to parse font detection JSON output');
    return {
      success: false,
      missingFonts: [],
      substitutedFonts: [],
      rawJson: undefined,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  }
}

function extractFontList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}
