import { spawn } from 'node:child_process';

export interface PythonCommandResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  command: string[];
}

export interface RunPythonScriptInput {
  scriptPath: string;
  args?: string[] | undefined;
  cwd?: string | undefined;
  timeoutMs?: number | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function getPythonBin(): string {
  return process.env.PRESENTATION_AUTHOR_PYTHON_BIN ?? 'python3';
}

export async function runPythonScript(
  input: RunPythonScriptInput,
): Promise<PythonCommandResult> {
  const pythonBin = getPythonBin();
  const command = [pythonBin, input.scriptPath, ...(input.args ?? [])];
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  return new Promise<PythonCommandResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const proc = spawn(pythonBin, [input.scriptPath, ...(input.args ?? [])], {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: !timedOut && exitCode === 0,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        command,
      });
    };

    proc.on('close', (code) => finish(code));
    proc.on('error', (err) => {
      stderr += `\n[spawn error] ${err.message}`;
      finish(null);
    });
  });
}
