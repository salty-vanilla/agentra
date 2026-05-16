import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prepareSandboxRuntime } from './executor.js';

describe('prepareSandboxRuntime', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'prepare-sandbox-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('rewrites the bundled pptxgenjs with jszip path when pattern matches', async () => {
    const pptxgenjsBundlePath = join(workDir, 'pptxgenjs.cjs');
    const jszipBundlePath = '/path/to/jszip.min.js';

    const bundleContent = `
      const jszip = require('jszip');
      module.exports = { jszip };
    `;

    await writeFile(pptxgenjsBundlePath, bundleContent, 'utf-8');

    const result = await prepareSandboxRuntime({
      workDir,
      pptxgenjsBundlePath,
      jszipBundlePath,
      prismjsMainPath: '/path/to/prism.js',
      mathjaxFullDir: '/path/to/mathjax-full',
    });

    expect(result.bundlePath).toBeDefined();
    expect(result.preloadPath).toBeDefined();
  });

  it('throws an error if the jszip require pattern does not match', async () => {
    const pptxgenjsBundlePath = join(workDir, 'pptxgenjs.cjs');
    const jszipBundlePath = '/path/to/jszip.min.js';

    const bundleContent = `
      module.exports = { someOtherDep: require('other-lib') };
    `;

    await writeFile(pptxgenjsBundlePath, bundleContent, 'utf-8');

    await expect(
      prepareSandboxRuntime({
        workDir,
        pptxgenjsBundlePath,
        jszipBundlePath,
        prismjsMainPath: '/path/to/prism.js',
        mathjaxFullDir: '/path/to/mathjax-full',
      }),
    ).rejects.toThrow();
  });

  it('throws an error if multiple jszip patterns are found', async () => {
    const pptxgenjsBundlePath = join(workDir, 'pptxgenjs.cjs');
    const jszipBundlePath = '/path/to/jszip.min.js';

    const bundleContent = `
      const jszip1 = require('jszip');
      const jszip2 = require('jszip');
      module.exports = { jszip1, jszip2 };
    `;

    await writeFile(pptxgenjsBundlePath, bundleContent, 'utf-8');

    await expect(
      prepareSandboxRuntime({
        workDir,
        pptxgenjsBundlePath,
        jszipBundlePath,
        prismjsMainPath: '/path/to/prism.js',
        mathjaxFullDir: '/path/to/mathjax-full',
      }),
    ).rejects.toThrow();
  });

  it('preload resolves all sandbox packages (integration)', async () => {
    // Soft-skip when sandbox runtime is not installed locally
    const fromEnv = process.env.PRESENTATION_SANDBOX_RUNTIME_DIR?.trim();
    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const localDir = join(pkgRoot, '.sandbox-runtime');
    let sandboxDir: string | null = fromEnv || null;
    if (!sandboxDir) {
      try {
        await access(localDir);
        sandboxDir = localDir;
      } catch {
        return;
      }
    }

    const sandboxNodeModules = join(sandboxDir, 'node_modules');
    const pptxgenjsBundlePath = createRequire(
      join(sandboxNodeModules, 'pptxgenjs', 'package.json'),
    ).resolve('pptxgenjs');
    const jszipBundlePath = join(sandboxNodeModules, 'jszip', 'dist', 'jszip.min.js');
    const prismjsMainPath = createRequire(
      join(sandboxNodeModules, 'prismjs', 'package.json'),
    ).resolve('prismjs');
    const mathjaxFullDir = join(sandboxNodeModules, 'mathjax-full');

    const { preloadPath } = await prepareSandboxRuntime({
      workDir,
      pptxgenjsBundlePath,
      jszipBundlePath,
      prismjsMainPath,
      mathjaxFullDir,
    });

    const checks = [
      "require.resolve('pptxgenjs')",
      "require.resolve('jszip')",
      "require.resolve('prismjs')",
      // prism language components depend on Prism being loaded first
      "require('prismjs'); require.resolve('prismjs/components/prism-typescript')",
      "require.resolve('mathjax-full/js/mathjax.js')",
    ];
    for (const check of checks) {
      try {
        execFileSync(process.execPath, ['--require', preloadPath, '-e', check], {
          stdio: 'pipe',
        });
      } catch (err) {
        const stderr =
          err instanceof Error && 'stderr' in err
            ? (err as { stderr?: Buffer }).stderr?.toString()
            : String(err);
        throw new Error(`Preload did not resolve ${check}: ${stderr}`);
      }
    }
  });
});
