import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
