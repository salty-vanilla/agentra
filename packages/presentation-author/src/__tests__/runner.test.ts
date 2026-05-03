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

const FAKE_PPTX_SCRIPT = `
const pptxgen = require("pptxgenjs");

async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "presentation-author";

  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addText("テスト資料", {
    x: 0.7, y: 0.5, w: 12, h: 0.6,
    fontFace: "Arial", fontSize: 32, bold: true, color: "111827",
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

describe('runPresentationAuthor', () => {
  it('executes a fake LLM script and produces deck.pptx', async () => {
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
  it('passes valid script', () => {
    const code = `const p = require("pptxgenjs"); pptx.writeFile({ fileName: "deck.pptx" });`;
    const result = validateAuthoringScript(code);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
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
