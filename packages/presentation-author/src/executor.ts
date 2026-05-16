import { spawn } from 'node:child_process';
import { access, cp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairPptx } from './pptx-repair.js';
import type { AuthoringScriptExecutionResult, PptxRepairSummary } from './types.js';

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

async function resolveSandboxRuntimeDir(explicit?: string): Promise<string> {
  if (explicit) return explicit;

  const fromEnv = process.env.PRESENTATION_SANDBOX_RUNTIME_DIR?.trim();
  if (fromEnv) return fromEnv;

  // Check local .sandbox-runtime relative to package root.
  // import.meta.url points to dist/executor.js; pkg root is two levels up.
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const localDir = join(pkgRoot, '.sandbox-runtime');
  try {
    await access(localDir);
    return localDir;
  } catch {}

  const globalDefault = '/opt/presentation-sandbox-runtime';
  try {
    await access(globalDefault);
    return globalDefault;
  } catch {
    throw new Error(
      'Sandbox runtime is not prepared.\n' +
        'Run:\n  pnpm --filter @agentra/presentation-author sandbox:install\n' +
        'or set:\n  PRESENTATION_SANDBOX_RUNTIME_DIR=/path/to/sandbox-runtime',
    );
  }
}

export async function prepareSandboxRuntime(input: {
  workDir: string;
  pptxgenjsBundlePath: string;
  jszipBundlePath: string;
  prismjsMainPath: string;
  mathjaxFullDir: string;
}): Promise<{ bundlePath: string; preloadPath: string }> {
  const preloadPath = join(input.workDir, 'sandbox-preload.cjs');
  const bundlePath = join(input.workDir, 'pptxgenjs-sandbox.cjs');

  const pptxgenjsBundleSource = await readFile(input.pptxgenjsBundlePath, 'utf-8');
  const pattern = /require\((['"])jszip\1\)/;

  const matches = pptxgenjsBundleSource.match(new RegExp(pattern.source, 'g'));
  if (!matches || matches.length === 0) {
    throw new Error(
      `Failed to prepare sandbox runtime: jszip require pattern not found in bundled pptxgenjs`,
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      `Failed to prepare sandbox runtime: expected exactly 1 jszip require pattern, found ${matches.length}`,
    );
  }

  const rewrittenPptxgenjsBundleSource = pptxgenjsBundleSource.replace(
    pattern,
    `require(${JSON.stringify(input.jszipBundlePath)})`,
  );

  // Preload intercepts require() calls for all sandbox-runtime packages,
  // redirecting them to the isolated node_modules inside sandboxRuntimeDir.
  const prismjsPkgDir = dirname(input.prismjsMainPath);
  const preloadSource = [
    "const Module = require('node:module');",
    "const path = require('node:path');",
    'const originalResolveFilename = Module._resolveFilename;',
    'Module._resolveFilename = function(request, parent, isMain, options) {',
    `  if (request === 'pptxgenjs') return ${JSON.stringify(bundlePath)};`,
    `  if (request === 'jszip') return ${JSON.stringify(input.jszipBundlePath)};`,
    `  if (request === 'prismjs' || request.startsWith('prismjs/')) {`,
    `    if (request === 'prismjs') return ${JSON.stringify(input.prismjsMainPath)};`,
    `    var sub = request.slice('prismjs'.length);`,
    `    var r = path.join(${JSON.stringify(prismjsPkgDir)}, sub);`,
    `    if (!path.extname(r)) r += '.js';`,
    `    return r;`,
    `  }`,
    `  if (request.startsWith('mathjax-full/')) {`,
    `    return path.join(${JSON.stringify(input.mathjaxFullDir)}, request.slice('mathjax-full'.length));`,
    `  }`,
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
  sandboxRuntimeDir?: string | undefined;
}): Promise<AuthoringScriptExecutionResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();
  const sandboxWorkDir = await realpath(input.workDir);

  const sandboxRuntimeDir = await resolveSandboxRuntimeDir(input.sandboxRuntimeDir);
  const sandboxNodeModules = join(sandboxRuntimeDir, 'node_modules');

  let pptxgenjsBundlePath: string;
  let jszipBundlePath: string;
  let prismjsMainPath: string;
  let mathjaxFullDir: string;
  try {
    pptxgenjsBundlePath = createRequire(
      join(sandboxNodeModules, 'pptxgenjs', 'package.json'),
    ).resolve('pptxgenjs');
    jszipBundlePath = join(sandboxNodeModules, 'jszip', 'dist', 'jszip.min.js');
    prismjsMainPath = createRequire(
      join(sandboxNodeModules, 'prismjs', 'package.json'),
    ).resolve('prismjs');
    mathjaxFullDir = join(sandboxNodeModules, 'mathjax-full');
  } catch {
    throw new Error(
      `Failed to resolve sandbox runtime dependencies from ${sandboxRuntimeDir}. ` +
        'Run: pnpm --filter @agentra/presentation-author sandbox:install',
    );
  }

  const { bundlePath: sandboxBundlePath, preloadPath: sandboxPreloadPath } =
    await prepareSandboxRuntime({
      workDir: sandboxWorkDir,
      pptxgenjsBundlePath,
      jszipBundlePath,
      prismjsMainPath,
      mathjaxFullDir,
    });
  const nodePathUsed = sandboxPreloadPath;

  // Run generated code with a strict permission boundary:
  // - only the workspace and sandbox runtime node_modules are readable
  // - only the workspace is writable
  // - no parent process environment is inherited
  const sandboxEnv: NodeJS.ProcessEnv = {
    HOME: sandboxWorkDir,
    TMPDIR: sandboxWorkDir,
  };
  const nodeExecutableDir = dirname(process.execPath);
  const nodeInstallRoot = dirname(nodeExecutableDir);
  const sandboxSourceJsPath = join(sandboxWorkDir, basename(input.sourceJsPath));

  // Validate that the source file exists and copy it into the sandbox if needed
  try {
    await access(input.sourceJsPath);
  } catch {
    throw new Error(
      `Source script not found: ${input.sourceJsPath}. The source script must exist before calling executeAuthoringScript.`,
    );
  }

  // Resolve both paths to handle symlinks and verify they're different before copying
  const resolvedSourcePath = await realpath(input.sourceJsPath);
  const arePathsSame = resolvedSourcePath === sandboxSourceJsPath;

  if (!arePathsSame) {
    try {
      await cp(input.sourceJsPath, sandboxSourceJsPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to copy source script from ${input.sourceJsPath} to ${sandboxSourceJsPath}: ${message}`,
      );
    }
  }

  const fsReadAllowList = [
    sandboxWorkDir,
    sandboxPreloadPath,
    sandboxBundlePath,
    jszipBundlePath,
    process.execPath,
    nodeExecutableDir,
    nodeInstallRoot,
    sandboxNodeModules,
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

  const spawnResult = await new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
  }>((resolve, reject) => {
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
      resolve({ exitCode, stdout, stderr, durationMs, timedOut });
    });
  });

  const success = spawnResult.exitCode === 0;
  let pptxRepair: PptxRepairSummary | undefined;
  if (success) {
    pptxRepair = await runPptxRepair(input.pptxPath);
  }

  return {
    success,
    exitCode: spawnResult.exitCode,
    stdout: spawnResult.stdout,
    stderr: spawnResult.stderr,
    durationMs: spawnResult.durationMs,
    timedOut: spawnResult.timedOut,
    nodePathUsed,
    pptxRepair,
  };
}

async function runPptxRepair(pptxPath: string): Promise<PptxRepairSummary> {
  try {
    await access(pptxPath);
  } catch {
    return {
      applied: false,
      removedOverrides: [],
      removedFiles: [],
      rewrittenFiles: [],
      warnings: [`pptx-repair skipped: ${pptxPath} does not exist`],
    };
  }
  try {
    return await repairPptx(pptxPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      applied: false,
      removedOverrides: [],
      removedFiles: [],
      rewrittenFiles: [],
      warnings: [`pptx post-process repair failed: ${message}`],
    };
  }
}
