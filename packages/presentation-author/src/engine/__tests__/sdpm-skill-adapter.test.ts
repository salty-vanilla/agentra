import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PresentationAuthorDeps, PresentationAuthorInput } from '../../types.js';
import { createSdpmSkillAdapter } from '../sdpm-skill-adapter.js';
import type { SdpmWorkspaceSpec } from '../sdpm-skill-runner.js';
import { resolveSdpmSkillDir, runSdpmGenerate } from '../sdpm-skill-runner.js';
import { PresentationAuthorEngineNotImplementedError } from '../types.js';

const input: PresentationAuthorInput = { prompt: '3枚の紹介スライド', language: 'ja' };
const deps = {} as PresentationAuthorDeps;

const sampleSpec: SdpmWorkspaceSpec = {
  deck: { template: 'blank-dark.pptx', defaultTextColor: '#FFFFFF' },
  brief: 'spike brief',
  slides: [
    { slug: 'intro', message: '目的', json: { layout: 'Blank', elements: [] } },
    { slug: 'summary', message: '行動', json: { layout: 'Blank' } },
  ],
};

const createdDirs: string[] = [];
afterEach(async () => {
  for (const d of createdDirs)
    await rm(d, { recursive: true, force: true }).catch(() => {});
  createdDirs.length = 0;
});

describe('createSdpmSkillAdapter', () => {
  it('authors, materializes, generates, and returns the engine result', async () => {
    const author = vi.fn(async () => sampleSpec);
    const generate = vi.fn(async (i: { workspaceDir: string; pptxPath: string }) => ({
      success: true,
      pptxPath: i.pptxPath,
      warnings: [],
      stdout: '',
      stderr: '',
    }));

    const adapter = createSdpmSkillAdapter({
      authorWorkspace: author,
      runGenerate: generate,
    });
    const result = await adapter.createPresentation(input, deps);
    createdDirs.push(result.workspaceDir as string);

    expect(result.engine).toBe('sdpm-skill');
    expect(result.pptxPath).toMatch(/deck\.pptx$/);
    expect(result.deckJsonPath).toMatch(/deck\.json$/);
    expect(result.slideJsonPaths).toHaveLength(2);
    expect(author).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();

    // Workspace was actually materialized on disk.
    expect(existsSync(result.deckJsonPath as string)).toBe(true);
    const outline = await readFile(
      join(result.workspaceDir as string, 'specs', 'outline.md'),
      'utf-8',
    );
    expect(outline).toContain('- [intro] 目的');
  });

  it('throws a clear NotImplemented error when generate fails', async () => {
    const adapter = createSdpmSkillAdapter({
      authorWorkspace: async () => sampleSpec,
      runGenerate: async () => ({
        success: false,
        pptxPath: null,
        warnings: ['SDPM skill directory not configured'],
        stdout: '',
        stderr: '',
      }),
      workspaceRoot: tmpdir(),
    });
    await expect(adapter.createPresentation(input, deps)).rejects.toBeInstanceOf(
      PresentationAuthorEngineNotImplementedError,
    );
  });
});

// Real end-to-end against the vendored/cloned SDPM skill, gated on SDPM_SKILL_DIR.
describe.skipIf(!resolveSdpmSkillDir())('sdpm-skill real generate', () => {
  it('generates a real PPTX from an authored workspace', async () => {
    const adapter = createSdpmSkillAdapter({ authorWorkspace: async () => sampleSpec });
    const result = await adapter.createPresentation(input, deps);
    createdDirs.push(result.workspaceDir as string);
    expect(existsSync(result.pptxPath)).toBe(true);
  }, 60_000);

  it('runSdpmGenerate degrades to success:false on a missing workspace', async () => {
    const res = await runSdpmGenerate({
      workspaceDir: '/nonexistent-ws',
      pptxPath: join(tmpdir(), 'x.pptx'),
    });
    expect(res.success).toBe(false);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
