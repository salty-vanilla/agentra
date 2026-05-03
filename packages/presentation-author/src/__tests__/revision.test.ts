import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PresentationDiagnosticsResult } from '../diagnostics.js';
import { buildSingleRevisionPrompt } from '../revision-prompts.js';
import { runPresentationAuthor } from '../runner.js';
import type { LlmClient, PresentationAuthorDeps } from '../types.js';

const INITIAL_SCRIPT = `
const pptxgen = require("pptxgenjs");
async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("Initial", { x: 1, y: 1, w: 10, h: 1, fontSize: 24 });
  await pptx.writeFile({ fileName: "deck.pptx" });
}
main().catch((err) => { console.error(err); process.exit(1); });
`;

const REVISED_SCRIPT = `
const pptxgen = require("pptxgenjs");
async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("Revised", { x: 1, y: 1, w: 10, h: 1, fontSize: 24 });
  await pptx.writeFile({ fileName: "deck.pptx" });
}
main().catch((err) => { console.error(err); process.exit(1); });
`;

const BAD_SCRIPT_DANGEROUS = `
const pptxgen = require("pptxgenjs");
const { exec } = require("child_process");
exec("rm -rf /");
`;

const BAD_SCRIPT_RUNTIME = `
const pptxgen = require("pptxgenjs");
// deck.pptx
async function main() {
  throw new Error("Intentional failure");
}
main();
`;

const NO_OUTPUT_SCRIPT = `
const pptxgen = require("pptxgenjs");
async function main() {
  console.log("Did not write deck.pptx");
}
main().catch((err) => { console.error(err); process.exit(1); });
`;

function diagPass(): PresentationDiagnosticsResult {
  return { status: 'pass', warnings: [] };
}

function diagWarn(): PresentationDiagnosticsResult {
  return {
    status: 'warn',
    warnings: ['overflow on slide 1'],
    overflow: {
      success: true,
      passed: false,
      overflowSlideNumbers: [1],
      stdout: '',
      stderr: '',
      durationMs: 0,
      warnings: [],
    },
  };
}

function makeDeps(
  responses: string[],
  diagResults?: PresentationDiagnosticsResult[],
): PresentationAuthorDeps & { callCount: () => number } {
  let llmCallCount = 0;
  let diagCallCount = 0;

  const deps: PresentationAuthorDeps & { callCount: () => number } = {
    llm: {
      generateText: async () => {
        const resp = responses[llmCallCount] ?? responses[responses.length - 1]!;
        llmCallCount++;
        return resp;
      },
    },
    randomId: () => `rev-test-${Date.now()}`,
    callCount: () => llmCallCount,
  };

  if (diagResults) {
    deps.runDiagnostics = async () => {
      const result = diagResults[diagCallCount] ?? diagResults[diagResults.length - 1]!;
      diagCallCount++;
      return result;
    };
  }

  return deps;
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  cleanupDirs.length = 0;
});

describe('revision disabled preserves PA-3 behavior', () => {
  it('revision undefined — no revision result', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-disabled');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT]);
    const result = await runPresentationAuthor({ prompt: 'test', outputDir }, deps);

    expect(result.revision).toBeUndefined();
    expect(deps.callCount()).toBe(1);
    expect(result.execution.success).toBe(true);
  }, 30_000);
});

describe('revision skipped when diagnostics pass', () => {
  it('returns attempted=false, reason diagnostics-pass', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-pass');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT], [diagPass()]);
    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir, revision: true },
      deps,
    );

    expect(result.revision).toBeDefined();
    expect(result.revision!.attempted).toBe(false);
    expect(result.revision!.reason).toBe('diagnostics-pass');
    expect(deps.callCount()).toBe(1);
  }, 30_000);
});

describe('revision runs when diagnostics warn', () => {
  it('revises and succeeds', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-warn');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT, REVISED_SCRIPT], [diagWarn(), diagPass()]);

    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir, revision: true },
      deps,
    );

    expect(deps.callCount()).toBe(2);
    expect(result.revision).toBeDefined();
    expect(result.revision!.attempted).toBe(true);
    expect(result.revision!.succeeded).toBe(true);
    expect(result.revision!.reason).toBe('revision-succeeded');
    expect(existsSync(result.pptxPath)).toBe(true);

    // Root presentation.js should contain revised content
    const rootCode = await readFile(result.sourceJsPath, 'utf-8');
    expect(rootCode).toContain('Revised');
  }, 30_000);
});

describe('revision validation failure keeps initial', () => {
  it('returns succeeded=false, reason revision-validation-failed', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-valfail');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT, BAD_SCRIPT_DANGEROUS], [diagWarn()]);

    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir, revision: true },
      deps,
    );

    expect(result.revision).toBeDefined();
    expect(result.revision!.attempted).toBe(true);
    expect(result.revision!.succeeded).toBe(false);
    expect(result.revision!.reason).toBe('revision-validation-failed');

    // Initial deck preserved
    expect(existsSync(result.pptxPath)).toBe(true);
    const rootCode = await readFile(result.sourceJsPath, 'utf-8');
    expect(rootCode).toContain('Initial');
  }, 30_000);
});

describe('revision execution failure keeps initial', () => {
  it('returns succeeded=false, reason revision-execution-failed', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-execfail');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT, BAD_SCRIPT_RUNTIME], [diagWarn()]);

    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir, revision: true },
      deps,
    );

    expect(result.revision).toBeDefined();
    expect(result.revision!.attempted).toBe(true);
    expect(result.revision!.succeeded).toBe(false);
    expect(result.revision!.reason).toBe('revision-execution-failed');

    // Initial deck preserved
    expect(existsSync(result.pptxPath)).toBe(true);
    const rootCode = await readFile(result.sourceJsPath, 'utf-8');
    expect(rootCode).toContain('Initial');
  }, 30_000);
});

describe('revision output missing keeps initial', () => {
  it('returns succeeded=false, reason revision-output-missing', async () => {
    const outputDir = join(tmpdir(), 'pa-rev-nomissing');
    cleanupDirs.push(outputDir);

    const deps = makeDeps([INITIAL_SCRIPT, NO_OUTPUT_SCRIPT], [diagWarn()]);

    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir, revision: true },
      deps,
    );

    expect(result.revision).toBeDefined();
    expect(result.revision!.attempted).toBe(true);
    expect(result.revision!.succeeded).toBe(false);
    expect(result.revision!.reason).toBe('revision-output-missing');

    // Initial deck preserved
    expect(existsSync(result.pptxPath)).toBe(true);
    const rootCode = await readFile(result.sourceJsPath, 'utf-8');
    expect(rootCode).toContain('Initial');
  }, 30_000);
});

describe('buildSingleRevisionPrompt', () => {
  it('contains required constraints', () => {
    const prompt = buildSingleRevisionPrompt({
      originalUserPrompt: 'Make a test deck',
      language: 'en',
      previousCode: 'const x = 1;',
      diagnostics: diagWarn(),
    });

    expect(prompt).toContain('full revised JavaScript');
    expect(prompt).toContain('not a patch or diff');
    expect(prompt).toContain('deck.pptx');
    expect(prompt).toContain('./helpers/pptxgenjs_helpers');
    expect(prompt).toContain('network access');
    expect(prompt).toContain('destructive');
    expect(prompt).toContain('Make a test deck');
    expect(prompt).toContain('overflow');
  });
});
