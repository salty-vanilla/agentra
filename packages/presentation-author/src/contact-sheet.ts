import { access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runPythonScript } from './python-runner.js';

export interface CreateContactSheetInput {
  inputDir: string;
  outputFile?: string | undefined;
  scriptsDir?: string | undefined;
  columns?: number | undefined;
  cellWidth?: number | undefined;
  cellHeight?: number | undefined;
  gap?: number | undefined;
  labelMode?: 'number' | 'filename' | 'none' | undefined;
  timeoutMs?: number | undefined;
}

export interface CreateContactSheetResult {
  success: boolean;
  contactSheetPath: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  warnings: string[];
}

export async function createContactSheet(
  input: CreateContactSheetInput,
): Promise<CreateContactSheetResult> {
  const parentDir = dirname(input.inputDir);
  const scriptsDir = input.scriptsDir ?? join(parentDir, 'scripts');
  const scriptPath = join(scriptsDir, 'create_montage.py');
  const outputFile =
    input.outputFile ?? join(parentDir, 'artifacts', 'contact_sheet.png');
  const columns = input.columns ?? 3;
  const cellWidth = input.cellWidth ?? 400;
  const cellHeight = input.cellHeight ?? 225;
  const gap = input.gap ?? 16;
  const labelMode = input.labelMode ?? 'number';
  const warnings: string[] = [];

  await mkdir(dirname(outputFile), { recursive: true });

  const result = await runPythonScript({
    scriptPath,
    args: [
      '--input_dir',
      input.inputDir,
      '--output_file',
      outputFile,
      '--num_col',
      String(columns),
      '--cell_width',
      String(cellWidth),
      '--cell_height',
      String(cellHeight),
      '--gap',
      String(gap),
      '--label_mode',
      labelMode,
    ],
    cwd: parentDir,
    timeoutMs: input.timeoutMs,
  });

  if (!result.success) {
    if (result.timedOut) {
      warnings.push('Contact sheet generation timed out');
    }
    return {
      success: false,
      contactSheetPath: outputFile,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings: [...warnings, `create_montage.py failed (exit ${result.exitCode})`],
    };
  }

  try {
    await access(outputFile);
  } catch {
    warnings.push('create_montage.py succeeded but output file not found');
    return {
      success: false,
      contactSheetPath: outputFile,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      warnings,
    };
  }

  return {
    success: true,
    contactSheetPath: outputFile,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    warnings,
  };
}
