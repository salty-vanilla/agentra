import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeAuthoringScript } from '../executor.js';
import { isSandboxRuntimeAvailable } from '../test-utils.js';

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  cleanupDirs.length = 0;
});

describe('executeAuthoringScript', () => {
  it.skipIf(!isSandboxRuntimeAvailable())(
    'runs generated code inside a restricted permission sandbox',
    async () => {
      const workDir = await mkdtemp(join(tmpdir(), 'pa-executor-'));
      cleanupDirs.push(workDir);

      const sourceJsPath = join(workDir, 'probe.js');
      const probeJsonPath = join(workDir, 'probe.json');
      const script = `
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

async function main() {
  const result = {
    awsSecret: process.env.AWS_SECRET_ACCESS_KEY ?? null,
    pexels: process.env.PEXELS_API_KEY ?? null,
    home: process.env.HOME ?? null,
  };

  try {
    execFileSync(process.execPath, ['-e', 'process.stdout.write("spawn-ok")']);
    result.childProcess = 'allowed';
  } catch (error) {
    result.childProcess = \`denied:\${error.code ?? error.name ?? 'error'}\`;
  }

  try {
    fs.readFileSync('/etc/hosts');
    result.outsideRead = 'allowed';
  } catch (error) {
    result.outsideRead = \`denied:\${error.code ?? error.name ?? 'error'}\`;
  }

  fs.writeFileSync('deck.pptx', 'placeholder');
  fs.writeFileSync('probe.json', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

      await writeFile(sourceJsPath, script, 'utf-8');

      const originalAwsSecret = process.env.AWS_SECRET_ACCESS_KEY;
      const originalPexelsKey = process.env.PEXELS_API_KEY;
      process.env.AWS_SECRET_ACCESS_KEY = 'super-secret-from-parent';
      process.env.PEXELS_API_KEY = 'pexels-secret-from-parent';

      try {
        const result = await executeAuthoringScript({
          workDir,
          sourceJsPath,
          pptxPath: join(workDir, 'deck.pptx'),
          timeoutMs: 10_000,
        });

        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);

        const probe = JSON.parse(await readFile(probeJsonPath, 'utf-8')) as {
          awsSecret: string | null;
          childProcess: string;
          home: string | null;
          pexels: string | null;
          outsideRead: string;
        };

        expect(probe.awsSecret).toBeNull();
        expect(probe.pexels).toBeNull();
        expect(probe.home).toBe(await realpath(workDir));
        expect(probe.childProcess).toMatch(/^denied:/);
        expect(probe.outsideRead).toMatch(/^denied:/);
      } finally {
        if (originalAwsSecret === undefined) {
          delete process.env.AWS_SECRET_ACCESS_KEY;
        } else {
          process.env.AWS_SECRET_ACCESS_KEY = originalAwsSecret;
        }
        if (originalPexelsKey === undefined) {
          delete process.env.PEXELS_API_KEY;
        } else {
          process.env.PEXELS_API_KEY = originalPexelsKey;
        }
      }
    },
    20_000,
  );
});
