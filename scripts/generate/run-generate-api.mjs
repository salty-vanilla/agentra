import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const workspaceHash = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
const lockRootDir = path.resolve(os.tmpdir(), 'agentra-generate-api-locks', workspaceHash);
const lockDir = path.resolve(lockRootDir, 'lock');
const lockMetaPath = path.join(lockDir, 'meta.json');
const lockWaitMs = 200;
const lockTimeoutMs = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'null'}`));
    });
  });
}

async function acquireLock() {
  const startedAt = Date.now();
  await mkdir(lockRootDir, { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir, { recursive: false });
      await writeFile(
        lockMetaPath,
        JSON.stringify(
          {
            pid: process.pid,
            startedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );

      return;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
        if (Date.now() - startedAt > lockTimeoutMs) {
          throw new Error(
            `Timed out while waiting for generate:api lock after ${lockTimeoutMs / 1000}s`,
          );
        }

        await sleep(lockWaitMs);
        continue;
      }

      throw error;
    }
  }
}

async function releaseLock() {
  await rm(lockDir, { recursive: true, force: true });
}

await acquireLock();

try {
  await run('pnpm', ['exec', 'orval', '--config', './orval.config.ts']);
  await run(process.execPath, ['./scripts/generate/postprocess-orval.mjs']);
} finally {
  await releaseLock();
}
