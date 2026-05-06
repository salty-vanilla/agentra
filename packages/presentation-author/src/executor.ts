import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AuthoringScriptExecutionResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Resolve the node_modules directory containing a given module.
 * Used to set NODE_PATH so child processes can find pptxgenjs.
 */
export function resolveNodeModulePath(moduleName: string): string {
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve(`${moduleName}/package.json`);
  // e.g. /path/to/node_modules/pptxgenjs/package.json -> /path/to/node_modules
  return dirname(dirname(pkgJsonPath));
}

export async function executeAuthoringScript(input: {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  timeoutMs?: number | undefined;
}): Promise<AuthoringScriptExecutionResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();

  // Resolve NODE_PATH to include our pptxgenjs dependency
  let nodePathUsed: string;
  try {
    nodePathUsed = resolveNodeModulePath('pptxgenjs');
  } catch {
    // Fallback: use package-local node_modules
    nodePathUsed = join(
      dirname(dirname(import.meta.url.replace('file://', ''))),
      'node_modules',
    );
  }

  const existingNodePath = process.env.NODE_PATH ?? '';
  const combinedNodePath = existingNodePath
    ? `${nodePathUsed}:${existingNodePath}`
    : nodePathUsed;

  return new Promise<AuthoringScriptExecutionResult>((resolve, reject) => {
    const child = spawn('node', [input.sourceJsPath], {
      cwd: input.workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: {
        ...process.env,
        NODE_PATH: combinedNodePath,
      },
    });

    let timedOut = false;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('error', (err) => {
      if (err.message.includes('ETIMEDOUT') || err.message.includes('killed')) {
        timedOut = true;
      } else {
        reject(new Error(`Failed to spawn node process: ${err.message}`));
      }
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
        timedOut,
        nodePathUsed,
      });
    });
  });
}
