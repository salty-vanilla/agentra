import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthoringWorkspace } from './types.js';

const SOURCE_JS_NAME = 'presentation.js';
const PPTX_NAME = 'deck.pptx';

export async function createPresentationWorkspace(input: {
  outputDir?: string | undefined;
  runId?: string | undefined;
}): Promise<AuthoringWorkspace> {
  const runId = input.runId ?? randomUUID().slice(0, 8);
  const baseDir = input.outputDir ?? join(tmpdir(), 'presentation-author');
  const workDir = join(baseDir, runId);

  await mkdir(workDir, { recursive: true });

  return {
    workDir,
    sourceJsPath: join(workDir, SOURCE_JS_NAME),
    pptxPath: join(workDir, PPTX_NAME),
  };
}
