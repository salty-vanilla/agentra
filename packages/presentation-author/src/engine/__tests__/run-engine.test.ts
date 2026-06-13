import { describe, expect, it, vi } from 'vitest';
import type {
  PresentationAuthorDeps,
  PresentationAuthorInput,
  PresentationAuthorResult,
} from '../../types.js';
import { createAgentraPptxgenjsAdapter } from '../agentra-pptxgenjs-adapter.js';
import {
  runPresentationAuthorEngine,
  selectPresentationAuthorAdapter,
} from '../run-engine.js';
import { createSdpmSkillAdapter } from '../sdpm-skill-adapter.js';
import {
  PresentationAuthorEngineNotImplementedError,
  UnknownPresentationAuthorEngineError,
} from '../types.js';

const input: PresentationAuthorInput = { prompt: 'hello' };
const deps = {} as PresentationAuthorDeps;

function fakeAuthorResult(): PresentationAuthorResult {
  return {
    workDir: '/tmp/work',
    sourceJsPath: '/tmp/work/source.js',
    pptxPath: '/tmp/work/deck.pptx',
    warnings: ['w1'],
    // biome-ignore lint/suspicious/noExplicitAny: minimal execution stub for test
    execution: {} as any,
  };
}

describe('selectPresentationAuthorAdapter', () => {
  it('selects agentra-pptxgenjs by default', () => {
    const adapter = selectPresentationAuthorAdapter({ env: {} });
    expect(adapter.engine).toBe('agentra-pptxgenjs');
  });

  it('selects sdpm-skill from env', () => {
    const adapter = selectPresentationAuthorAdapter({
      env: { PRESENTATION_AUTHOR_ENGINE: 'sdpm-skill' },
    });
    expect(adapter.engine).toBe('sdpm-skill');
  });
});

describe('runPresentationAuthorEngine', () => {
  it('runs the default agentra engine and passes the full author result through', async () => {
    const runAuthor = vi.fn().mockResolvedValue(fakeAuthorResult());
    const result = await runPresentationAuthorEngine(input, deps, {
      env: {},
      adapters: { 'agentra-pptxgenjs': createAgentraPptxgenjsAdapter(runAuthor) },
    });

    expect(runAuthor).toHaveBeenCalledOnce();
    expect(result.engine).toBe('agentra-pptxgenjs');
    expect(result.pptxPath).toBe('/tmp/work/deck.pptx');
    expect(result.sourcePath).toBe('/tmp/work/source.js');
    expect(result.workspaceDir).toBe('/tmp/work');
    expect(result.warnings).toEqual(['w1']);
    expect(result.authorResult).toBeDefined();
    expect(result.authorResult?.pptxPath).toBe('/tmp/work/deck.pptx');
  });

  it('degrades with a clear error when sdpm-skill cannot generate', async () => {
    const sdpm = createSdpmSkillAdapter({
      authorWorkspace: async () => ({
        deck: {},
        slides: [{ slug: 'a', message: 'm', json: {} }],
      }),
      runGenerate: async () => ({
        success: false,
        pptxPath: null,
        warnings: ['SDPM skill directory not configured'],
        stdout: '',
        stderr: '',
      }),
    });
    await expect(
      runPresentationAuthorEngine(input, deps, {
        engine: 'sdpm-skill',
        adapters: { 'sdpm-skill': sdpm },
      }),
    ).rejects.toBeInstanceOf(PresentationAuthorEngineNotImplementedError);
  });

  it('throws on an unknown engine before running anything', async () => {
    await expect(
      runPresentationAuthorEngine(input, deps, { engine: 'bogus' }),
    ).rejects.toBeInstanceOf(UnknownPresentationAuthorEngineError);
  });

  it('does not invoke the agentra engine when sdpm-skill is selected', async () => {
    const runAuthor = vi.fn().mockResolvedValue(fakeAuthorResult());
    const sdpm = createSdpmSkillAdapter({
      authorWorkspace: async () => ({
        deck: {},
        slides: [{ slug: 'a', message: 'm', json: {} }],
      }),
      runGenerate: async () => ({
        success: false,
        pptxPath: null,
        warnings: ['no skill'],
        stdout: '',
        stderr: '',
      }),
    });
    await expect(
      runPresentationAuthorEngine(input, deps, {
        engine: 'sdpm-skill',
        adapters: {
          'agentra-pptxgenjs': createAgentraPptxgenjsAdapter(runAuthor),
          'sdpm-skill': sdpm,
        },
      }),
    ).rejects.toBeInstanceOf(PresentationAuthorEngineNotImplementedError);
    expect(runAuthor).not.toHaveBeenCalled();
  });
});
