import { spawn } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import type { AuthoringScriptExecutionResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Resolve the node_modules directory containing a given module.
 * Useful when locating bundled dependencies from this package's install tree.
 */
export function resolveNodeModulePath(moduleName: string): string {
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve(`${moduleName}/package.json`);
  // e.g. /path/to/node_modules/pptxgenjs/package.json -> /path/to/node_modules
  return dirname(dirname(pkgJsonPath));
}

function resolveNodeModulePackageJsonPath(moduleName: string): string {
  const require = createRequire(import.meta.url);
  return require.resolve(`${moduleName}/package.json`);
}

async function prepareSandboxRuntime(input: {
  workDir: string;
  pptxgenjsBundlePath: string;
  jszipBundlePath: string;
}): Promise<{ bundlePath: string; preloadPath: string }> {
  const preloadPath = join(input.workDir, 'sandbox-preload.cjs');
  const bundlePath = join(input.workDir, 'pptxgenjs-sandbox.cjs');

  const pptxgenjsBundleSource = await readFile(input.pptxgenjsBundlePath, 'utf-8');
  const rewrittenPptxgenjsBundleSource = pptxgenjsBundleSource.replace(
    /require\((['"])jszip\1\)/,
    `require(${JSON.stringify(input.jszipBundlePath)})`,
  );

  const preloadSource = [
    "const Module = require('node:module');",
    'const originalResolveFilename = Module._resolveFilename;',
    'Module._resolveFilename = function(request, parent, isMain, options) {',
    `  if (request === 'pptxgenjs') return ${JSON.stringify(bundlePath)};`,
    `  if (request === 'jszip') return ${JSON.stringify(input.jszipBundlePath)};`,
    '  return originalResolveFilename.call(this, request, parent, isMain, options);',
    '};',
    '',
  ].join('\n');

  await writeFile(bundlePath, rewrittenPptxgenjsBundleSource, 'utf-8');
  await writeFile(preloadPath, preloadSource, 'utf-8');
  return { bundlePath, preloadPath };
}

export async function executeAuthoringScript(input: {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  timeoutMs?: number | undefined;
}): Promise<AuthoringScriptExecutionResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();
  const sandboxWorkDir = await realpath(input.workDir);

  let pptxgenjsBundlePath: string;
  let jszipBundlePath: string;
  try {
    pptxgenjsBundlePath = createRequire(import.meta.url).resolve('pptxgenjs');
    jszipBundlePath = join(
      dirname(resolveNodeModulePackageJsonPath('jszip')),
      'dist',
      'jszip.min.js',
    );
  } catch {
    throw new Error('Failed to resolve bundled presentation dependencies.');
  }

  const { bundlePath: sandboxBundlePath, preloadPath: sandboxPreloadPath } =
    await prepareSandboxRuntime({
      workDir: sandboxWorkDir,
      pptxgenjsBundlePath,
      jszipBundlePath,
    });
  const nodePathUsed = sandboxPreloadPath;

  // Run generated code with a strict permission boundary:
  // - only the workspace and bundled node_modules are readable
  // - only the workspace is writable
  // - no parent process environment is inherited
  const sandboxEnv: NodeJS.ProcessEnv = {
    HOME: sandboxWorkDir,
    TMPDIR: sandboxWorkDir,
  };
  const nodeExecutableDir = dirname(process.execPath);
  const nodeInstallRoot = dirname(nodeExecutableDir);
  const sandboxSourceJsPath = join(sandboxWorkDir, basename(input.sourceJsPath));
  const fsReadAllowList = [
    sandboxWorkDir,
    sandboxPreloadPath,
    sandboxBundlePath,
    jszipBundlePath,
    process.execPath,
    nodeExecutableDir,
    nodeInstallRoot,
  ];
  const nodeArgs = [
    '--permission',
    ...fsReadAllowList.flatMap((path) => ['--allow-fs-read', path]),
    '--allow-fs-write',
    sandboxWorkDir,
    '--require',
    sandboxPreloadPath,
    sandboxSourceJsPath,
  ];

  return new Promise<AuthoringScriptExecutionResult>((resolve, reject) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: sandboxWorkDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: sandboxEnv,
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
