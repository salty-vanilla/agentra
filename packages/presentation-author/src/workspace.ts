import { cp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uuidv7 } from 'uuidv7';
import type { AuthoringWorkspace } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOURCE_JS_NAME = 'presentation.js';
const PPTX_NAME = 'deck.pptx';
const VENDOR_ROOT = join(__dirname, '..', 'vendor', 'openai-slides');
const HELPERS_SRC = join(VENDOR_ROOT, 'assets', 'pptxgenjs_helpers');
const SCRIPTS_SRC = join(VENDOR_ROOT, 'scripts');

const WORKSPACE_PACKAGE_JSON = JSON.stringify(
  {
    type: 'commonjs',
    dependencies: {
      pptxgenjs: '*',
    },
  },
  null,
  2,
);

export async function createPresentationWorkspace(input: {
  outputDir?: string | undefined;
  runId?: string | undefined;
}): Promise<AuthoringWorkspace> {
  const runId = input.runId ?? uuidv7();
  const baseDir = input.outputDir ?? join(tmpdir(), 'presentation-author');
  const workDir = join(baseDir, runId);

  const helpersDir = join(workDir, 'helpers', 'pptxgenjs_helpers');
  const scriptsDir = join(workDir, 'scripts');
  const renderDir = join(workDir, 'rendered');
  const artifactsDir = join(workDir, 'artifacts');
  const packageJsonPath = join(workDir, 'package.json');

  await mkdir(workDir, { recursive: true });
  await mkdir(renderDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  // Copy helpers and scripts into workspace
  const { warnings: _warnings } = await copyPresentationAuthorResources({
    workDir,
  });

  // Write workspace package.json
  await writeFile(packageJsonPath, WORKSPACE_PACKAGE_JSON, 'utf-8');

  return {
    workDir,
    sourceJsPath: join(workDir, SOURCE_JS_NAME),
    pptxPath: join(workDir, PPTX_NAME),
    helpersDir,
    scriptsDir,
    renderDir,
    artifactsDir,
    packageJsonPath,
  };
}

export async function copyPresentationAuthorResources(input: {
  workDir: string;
}): Promise<{
  helpersDir: string;
  scriptsDir: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const helpersDir = join(input.workDir, 'helpers', 'pptxgenjs_helpers');
  const scriptsDir = join(input.workDir, 'scripts');

  try {
    await cp(HELPERS_SRC, helpersDir, { recursive: true });
  } catch (err) {
    warnings.push(
      `Failed to copy pptxgenjs_helpers: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    await cp(SCRIPTS_SRC, scriptsDir, { recursive: true });
  } catch (err) {
    warnings.push(
      `Failed to copy scripts: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { helpersDir, scriptsDir, warnings };
}
