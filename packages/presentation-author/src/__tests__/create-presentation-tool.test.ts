import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectPresentationArtifacts } from '../artifacts.js';
import {
  buildCreatePresentationSummary,
  createPresentation,
  mapErrorToToolError,
} from '../create-presentation-tool.js';
import type { PresentationDiagnosticsResult } from '../diagnostics.js';
import type { LlmClient, PresentationAuthorDeps } from '../types.js';

const FAKE_PPTX_SCRIPT = `
const pptxgen = require("pptxgenjs");
const { safeOuterShadow } = require("./helpers/pptxgenjs_helpers/util");

async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("テスト", {
    x: 0.7, y: 0.5, w: 12, h: 0.6,
    fontFace: "Arial", fontSize: 32, bold: true,
  });
  await pptx.writeFile({ fileName: "deck.pptx" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

function fakeLlm(response: string): LlmClient {
  return { converse: async () => response };
}

function fakeDiagnosticsPass(): PresentationDiagnosticsResult {
  return { status: 'pass', warnings: [] };
}

function makeDeps(
  llmResponse: string,
  diagnostics?: PresentationDiagnosticsResult,
): PresentationAuthorDeps {
  const deps: PresentationAuthorDeps = {
    llm: fakeLlm(llmResponse),
    randomId: () => `tool-test-${Date.now()}`,
  };
  if (diagnostics) {
    deps.runDiagnostics = async () => diagnostics;
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

describe('createPresentation', () => {
  it('returns successful tool output with pptx and artifacts', async () => {
    const outputDir = join(tmpdir(), 'pa-tool-success');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'テスト資料を作成', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
    expect(result.pptxPath).toBeTruthy();
    expect(result.pptxPath && existsSync(result.pptxPath)).toBe(true);
    expect(result.sourceJsPath).toBeTruthy();
    expect(result.sourceJsPath && existsSync(result.sourceJsPath)).toBe(true);
    expect(result.workDir).toBeTruthy();
    expect(result.summary).toContain('successfully');
    expect(result.error).toBeUndefined();

    const kinds = result.artifacts.map((a) => a.kind);
    expect(kinds).toContain('pptx');
    expect(kinds).toContain('source-js');
    expect(kinds).toContain('work-dir');
  }, 30_000);

  it('defaults diagnostics and revision to true', async () => {
    const outputDir = join(tmpdir(), 'pa-tool-defaults');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'テスト資料', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
    // With diagnostics pass, revision should be skipped
    expect(result.revisionReason).toBe('diagnostics-pass');
    expect(result.revisionAttempted).toBe(false);
    expect(result.diagnosticsStatus).toBe('pass');
  }, 30_000);

  it('returns input-validation error for empty prompt', async () => {
    const result = await createPresentation({ prompt: '' }, makeDeps(FAKE_PPTX_SCRIPT));

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('input-validation');
    expect(result.error?.message).toContain('prompt');
    expect(result.artifacts).toHaveLength(0);
  });

  it('returns input-validation error for whitespace-only prompt', async () => {
    const result = await createPresentation(
      { prompt: '   ' },
      makeDeps(FAKE_PPTX_SCRIPT),
    );

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('input-validation');
  });

  it('returns input-validation error for oversized prompt', async () => {
    const result = await createPresentation(
      { prompt: 'x'.repeat(40_001) },
      makeDeps(FAKE_PPTX_SCRIPT),
    );

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('input-validation');
    expect(result.error?.message).toContain('40000');
  });

  it('maps script validation failure to structured error', async () => {
    const dangerousScript = `
const child_process = require("child_process");
child_process.exec("rm -rf /");
`;
    const outputDir = join(tmpdir(), 'pa-tool-dangerous');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'test', outputDir },
      makeDeps(dangerousScript),
    );

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('script-validation');
  }, 15_000);

  it('maps execution failure to structured error', async () => {
    const badScript = `
const pptxgen = require("pptxgenjs");
console.error("Something went wrong");
process.exit(1);
`;
    const outputDir = join(tmpdir(), 'pa-tool-exec-fail');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'test', outputDir, diagnostics: false, revision: false },
      makeDeps(badScript),
    );

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('script-execution');
  }, 15_000);

  it('infers Japanese language from prompt', async () => {
    const outputDir = join(tmpdir(), 'pa-tool-lang-ja');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: '報告資料を作成してください', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
  }, 30_000);

  it('infers English language from prompt', async () => {
    const outputDir = join(tmpdir(), 'pa-tool-lang-en');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'Create a quarterly report', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
  }, 30_000);
});

describe('collectPresentationArtifacts', () => {
  it('collects pptx, source-js, and work-dir artifacts', async () => {
    const outputDir = join(tmpdir(), 'pa-artifacts-test');
    cleanupDirs.push(outputDir);

    // Create a real workspace so paths exist
    const { createPresentationWorkspace } = await import('../workspace.js');
    const ws = await createPresentationWorkspace({ outputDir, runId: 'art-test' });

    const artifacts = await collectPresentationArtifacts({
      workDir: ws.workDir,
      pptxPath: ws.pptxPath,
      sourceJsPath: ws.sourceJsPath,
    });

    expect(artifacts.some((a) => a.kind === 'work-dir' && a.exists)).toBe(true);
    expect(artifacts.some((a) => a.kind === 'pptx')).toBe(true);
    expect(artifacts.some((a) => a.kind === 'source-js')).toBe(true);
  });

  it('collects diagnostics artifacts when provided', async () => {
    const fakeDiag: PresentationDiagnosticsResult = {
      status: 'pass',
      render: {
        success: true,
        renderDir: '/tmp/render',
        slideImagePaths: ['/tmp/render/slide_001.png', '/tmp/render/slide_002.png'],
        slideCount: 2,
        stdout: '',
        stderr: '',
        durationMs: 100,
        warnings: [],
      },
      contactSheet: {
        success: true,
        contactSheetPath: '/tmp/artifacts/contact_sheet.png',
        stdout: '',
        stderr: '',
        durationMs: 50,
        warnings: [],
      },
      warnings: [],
    };

    const artifacts = await collectPresentationArtifacts({
      workDir: '/tmp/test-work',
      pptxPath: '/tmp/test-work/deck.pptx',
      diagnostics: fakeDiag,
    });

    const kinds = artifacts.map((a) => a.kind);
    expect(kinds).toContain('contact-sheet');
    expect(kinds).toContain('render-dir');
    expect(kinds).toContain('rendered-slide');
    expect(artifacts.filter((a) => a.kind === 'rendered-slide')).toHaveLength(2);
  });
});

describe('buildCreatePresentationSummary', () => {
  it('builds success summary', () => {
    const summary = buildCreatePresentationSummary({
      success: true,
      prompt: 'test',
      diagnosticsStatus: 'pass',
      revisionReason: 'diagnostics-pass',
    });

    expect(summary).toContain('successfully');
    expect(summary).toContain('Diagnostics: pass');
    expect(summary).toContain('Revision skipped');
  });

  it('builds success summary with revision', () => {
    const summary = buildCreatePresentationSummary({
      success: true,
      prompt: 'test',
      diagnosticsStatus: 'warn',
      revisionAttempted: true,
      revisionSucceeded: true,
    });

    expect(summary).toContain('successfully');
    expect(summary).toContain('revision attempt succeeded');
  });

  it('builds failure summary', () => {
    const summary = buildCreatePresentationSummary({
      success: false,
      prompt: 'test',
      errorPhase: 'script-execution',
    });

    expect(summary).toContain('failed');
    expect(summary).toContain('script-execution');
  });
});

describe('mapErrorToToolError', () => {
  it('maps validation error', () => {
    const err = mapErrorToToolError(new Error('Authoring script validation failed'));
    expect(err.phase).toBe('script-validation');
  });

  it('maps execution error', () => {
    const err = mapErrorToToolError(new Error('execution failed (exit 1)'));
    expect(err.phase).toBe('script-execution');
  });

  it('maps LLM error', () => {
    const err = mapErrorToToolError(new Error('LLM call failed'));
    expect(err.phase).toBe('llm-generation');
  });

  it('maps unknown error', () => {
    const err = mapErrorToToolError(new Error('something unexpected'));
    expect(err.phase).toBe('unknown');
  });

  it('truncates long messages', () => {
    const err = mapErrorToToolError(new Error('x'.repeat(1000)));
    expect(err.message.length).toBeLessThanOrEqual(500);
  });
});
