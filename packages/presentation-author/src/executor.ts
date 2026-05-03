import { spawn } from 'node:child_process';
import type { AuthoringScriptExecutionResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

export async function executeAuthoringScript(input: {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  timeoutMs?: number | undefined;
}): Promise<AuthoringScriptExecutionResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();

  return new Promise<AuthoringScriptExecutionResult>((resolve, reject) => {
    const child = spawn('node', [input.sourceJsPath], {
      cwd: input.workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn node process: ${err.message}`));
    });

    child.on('close', (exitCode) => {
      const durationMs = Math.round(performance.now() - start);
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      resolve({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        durationMs,
      });
    });
  });
}
