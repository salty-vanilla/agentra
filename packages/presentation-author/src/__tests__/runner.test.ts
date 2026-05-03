import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractJavaScriptFromLlmOutput,
  validateAuthoringScript,
} from '../authoring-script.js';
import { runPresentationAuthor } from '../runner.js';
import type { LlmClient, PresentationAuthorDeps } from '../types.js';
import { createPresentationWorkspace } from '../workspace.js';

const FAKE_PPTX_SCRIPT = `
const pptxgen = require("pptxgenjs");
const { safeOuterShadow } = require("./helpers/pptxgenjs_helpers/util");

async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "presentation-author";

  const shadow = safeOuterShadow("333333", 0.3);
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addText("テスト資料", {
    x: 0.7, y: 0.5, w: 12, h: 0.6,
    fontFace: "Arial", fontSize: 32, bold: true, color: "111827",
    shadow,
  });
  slide.addText("Presentation Author smoke test", {
    x: 0.7, y: 1.4, w: 12, h: 0.5,
    fontFace: "Arial", fontSize: 18, color: "374151",
  });

  await pptx.writeFile({ fileName: "deck.pptx" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const FAKE_PPTX_SCRIPT_NO_HELPERS = `
const pptxgen = require("pptxgenjs");

async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText("No helpers", { x: 1, y: 1, w: 10, h: 1, fontSize: 24 });
  await pptx.writeFile({ fileName: "deck.pptx" });
}

main().catch((err) => { console.error(err); process.exit(1); });
`;

function fakeLlm(response: string): LlmClient {
  return {
    generateText: async () => response,
  };
}

function makeDeps(llmResponse: string): PresentationAuthorDeps {
  return {
    llm: fakeLlm(llmResponse),
    randomId: () => `test-${Date.now()}`,
  };
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  cleanupDirs.length = 0;
});

describe('workspace resources', () => {
  it('creates workspace with helpers and scripts', async () => {
    const outputDir = join(tmpdir(), 'pa-test-workspace');
    cleanupDirs.push(outputDir);

    const ws = await createPresentationWorkspace({ outputDir, runId: 'res-test' });

    expect(existsSync(join(ws.helpersDir, 'index.js'))).toBe(true);
    expect(existsSync(join(ws.helpersDir, 'text.js'))).toBe(true);
    expect(existsSync(join(ws.helpersDir, 'image.js'))).toBe(true);
    expect(existsSync(join(ws.helpersDir, 'layout.js'))).toBe(true);
    expect(existsSync(join(ws.scriptsDir, 'render_slides.py'))).toBe(true);
    expect(existsSync(join(ws.scriptsDir, 'create_montage.py'))).toBe(true);
    expect(existsSync(join(ws.scriptsDir, 'slides_test.py'))).toBe(true);
    expect(existsSync(join(ws.scriptsDir, 'detect_font.py'))).toBe(true);
    expect(existsSync(join(ws.scriptsDir, 'ensure_raster_image.py'))).toBe(true);
    expect(existsSync(ws.packageJsonPath)).toBe(true);
    expect(existsSync(ws.renderDir)).toBe(true);
    expect(existsSync(ws.artifactsDir)).toBe(true);
  });
});

describe('runPresentationAuthor', () => {
  it('executes script with helpers and produces deck.pptx', async () => {
    const outputDir = join(tmpdir(), 'pa-test-runner');
    cleanupDirs.push(outputDir);

    const result = await runPresentationAuthor(
      { prompt: 'テスト資料を作成してください', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT),
    );

    expect(result.workDir).toBeTruthy();
    expect(existsSync(result.workDir)).toBe(true);
    expect(existsSync(result.sourceJsPath)).toBe(true);
    expect(existsSync(result.pptxPath)).toBe(true);
    expect(result.pptxPath).toContain('deck.pptx');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.execution.success).toBe(true);
    expect(result.execution.exitCode).toBe(0);
    expect(result.execution.nodePathUsed).toBeTruthy();
  }, 30_000);

  it('executes script without helpers (produces warning)', async () => {
    const outputDir = join(tmpdir(), 'pa-test-nohelp');
    cleanupDirs.push(outputDir);

    const result = await runPresentationAuthor(
      { prompt: 'test', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT_NO_HELPERS),
    );

    expect(result.execution.success).toBe(true);
    expect(existsSync(result.pptxPath)).toBe(true);
    expect(result.warnings.some((w) => w.includes('helpers'))).toBe(true);
  }, 30_000);

  it('throws on execution failure with stderr summary', async () => {
    const badScript = `
      const pptxgen = require("pptxgenjs");
      console.error("Something went wrong writing deck.pptx");
      process.exit(1);
    `;
    const outputDir = join(tmpdir(), 'pa-test-fail');
    cleanupDirs.push(outputDir);

    await expect(
      runPresentationAuthor({ prompt: 'test', outputDir }, makeDeps(badScript)),
    ).rejects.toThrow(/execution failed/i);
  }, 15_000);

  it('throws when deck.pptx is not created', async () => {
    const noOutputScript = `
      const pptxgen = require("pptxgenjs");
      console.log("did not write deck.pptx");
    `;
    const outputDir = join(tmpdir(), 'pa-test-nopptx');
    cleanupDirs.push(outputDir);

    await expect(
      runPresentationAuthor({ prompt: 'test', outputDir }, makeDeps(noOutputScript)),
    ).rejects.toThrow(/deck\.pptx was not created/i);
  }, 15_000);
});

describe('extractJavaScriptFromLlmOutput', () => {
  it('extracts code from fenced block', () => {
    const input = '```javascript\nconsole.log("hello");\n```';
    const { code, warnings } = extractJavaScriptFromLlmOutput(input);
    expect(code).toBe('console.log("hello");');
    expect(warnings).toHaveLength(0);
  });

  it('treats unfenced text as code', () => {
    const input = 'const x = 1;';
    const { code } = extractJavaScriptFromLlmOutput(input);
    expect(code).toBe('const x = 1;');
  });

  it('warns on markdown-like content without fences', () => {
    const input = '# Title\nconst x = 1;';
    const { warnings } = extractJavaScriptFromLlmOutput(input);
    expect(warnings.some((w) => w.includes('markdown'))).toBe(true);
  });

  it('warns on empty code', () => {
    const { code, warnings } = extractJavaScriptFromLlmOutput('');
    expect(code).toBe('');
    expect(warnings.some((w) => w.includes('empty'))).toBe(true);
  });
});

describe('validateAuthoringScript', () => {
  it('passes valid script with helpers', () => {
    const code = `const p = require("pptxgenjs"); const h = require("./helpers/pptxgenjs_helpers"); pptx.writeFile({ fileName: "deck.pptx" });`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when helpers not imported', () => {
    const code = `const p = require("pptxgenjs"); pptx.writeFile({ fileName: "deck.pptx" });`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('helpers'))).toBe(true);
  });

  it('rejects script missing pptxgenjs', () => {
    const code = `console.log("deck.pptx");`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pptxgenjs'))).toBe(true);
  });

  it('rejects script with child_process', () => {
    const code = `require("pptxgenjs"); require("child_process"); writeFile("deck.pptx");`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('child_process'))).toBe(true);
  });

  it('rejects script with exec()', () => {
    const code = `require("pptxgenjs"); exec("rm -rf /"); "deck.pptx";`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(false);
  });

  it('rejects script with fs.unlink', () => {
    const code = `require("pptxgenjs"); fs.unlink("deck.pptx");`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(false);
  });
});
