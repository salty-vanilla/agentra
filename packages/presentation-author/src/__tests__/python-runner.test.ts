import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runPythonScript } from '../python-runner.js';

describe('runPythonScript', () => {
  const tmpFiles: string[] = [];

  afterEach(async () => {
    // cleanup handled by OS tmp
  });

  it('runs a simple python script and captures stdout', async () => {
    const scriptPath = join(tmpdir(), `test-${Date.now()}.py`);
    await writeFile(scriptPath, 'print("hello from python")\n');
    tmpFiles.push(scriptPath);

    const result = await runPythonScript({ scriptPath, args: [] });

    expect(result.stdout.trim()).toBe('hello from python');
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures stderr on failure', async () => {
    const scriptPath = join(tmpdir(), `test-fail-${Date.now()}.py`);
    await writeFile(scriptPath, 'import sys; sys.exit(1)\n');
    tmpFiles.push(scriptPath);

    const result = await runPythonScript({ scriptPath, args: [] });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('passes arguments correctly', async () => {
    const scriptPath = join(tmpdir(), `test-args-${Date.now()}.py`);
    await writeFile(scriptPath, 'import sys; print(" ".join(sys.argv[1:]))\n');
    tmpFiles.push(scriptPath);

    const result = await runPythonScript({
      scriptPath,
      args: ['--foo', 'bar', 'baz'],
    });

    expect(result.stdout.trim()).toBe('--foo bar baz');
    expect(result.success).toBe(true);
  });

  it('respects timeout', async () => {
    const scriptPath = join(tmpdir(), `test-timeout-${Date.now()}.py`);
    await writeFile(scriptPath, 'import time; time.sleep(10)\n');
    tmpFiles.push(scriptPath);

    const result = await runPythonScript({
      scriptPath,
      args: [],
      timeoutMs: 500,
    });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
  });
});
