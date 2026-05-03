import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runPythonScript } from './python-runner.js';

export interface RenderPresentationInput {
  pptxPath: string;
  outputDir?: string | undefined;
  scriptsDir?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  timeoutMs?: number | undefined;
}

export interface RenderPresentationResult {
  success: boolean;
  renderDir: string;
  slideImagePaths: string[];
  slideCount: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

export async function renderPresentation(
  input: RenderPresentationInput,
): Promise<RenderPresentationResult> {
  const pptxDir = dirname(input.pptxPath);
  const scriptsDir = input.scriptsDir ?? join(pptxDir, 'scripts');
  const scriptPath = join(scriptsDir, 'render_slides.py');
  const renderDir = input.outputDir ?? join(pptxDir, 'rendered');
  const width = input.width ?? 1600;
  const height = input.height ?? 900;
  const warnings: string[] = [];

  await mkdir(renderDir, { recursive: true });

  const result = await runPythonScript({
    scriptPath,
    args: [
      input.pptxPath,
      '--output_dir',
      renderDir,
      '--width',
      String(width),
      '--height',
      String(height),
    ],
    cwd: pptxDir,
    timeoutMs: input.timeoutMs,
  });

  if (!result.success) {
    if (result.timedOut) {
      warnings.push('Render timed out');
    }
    return {
      success: false,
      renderDir,
      slideImagePaths: [],
      slideCount: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings: [...warnings, `render_slides.py failed (exit ${result.exitCode})`],
    };
  }

  const slideImagePaths = await listSlideImages(renderDir);
  if (slideImagePaths.length === 0) {
    warnings.push('render_slides.py succeeded but no PNG files found in output');
    return {
      success: false,
      renderDir,
      slideImagePaths: [],
      slideCount: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  }

  return {
    success: true,
    renderDir,
    slideImagePaths,
    slideCount: slideImagePaths.length,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    warnings,
  };
}

async function listSlideImages(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    const pngs = entries
      .filter((f) => f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)/)?.[1] ?? '0', 10);
        const numB = parseInt(b.match(/(\d+)/)?.[1] ?? '0', 10);
        return numA - numB;
      })
      .map((f) => join(dir, f));
    return pngs;
  } catch {
    return [];
  }
}
