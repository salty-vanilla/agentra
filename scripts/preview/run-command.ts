/**
 * Thin, side-effecting wrappers around `child_process.spawnSync`.
 *
 * `runCapture` pipes stdout/stderr so callers can parse output (e.g. `cdk list`,
 * `aws sts get-caller-identity`). `runInherit` streams child output straight to
 * the terminal for long-running commands (`cdk synth`, `cdk deploy`).
 */
import { spawnSync } from 'node:child_process';

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runCapture(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error(`Failed to run "${command}": ${result.error.message}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function runInherit(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): number {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`Failed to run "${command}": ${result.error.message}`);
  }
  return result.status ?? 1;
}
