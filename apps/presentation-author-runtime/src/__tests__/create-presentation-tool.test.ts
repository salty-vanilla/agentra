import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  LlmClient,
  PresentationAuthorDeps,
  PresentationDiagnosticsResult,
} from '@agentra/presentation-author';
import { createPresentation } from '@agentra/presentation-author';
import { afterEach, describe, expect, it } from 'vitest';
import { SLIDE_AGENT_SYSTEM_PROMPT } from '../agent.js';
import { FONT_POLICY_STYLE_GUIDE, FONT_PRESETS } from '../font-policy.js';

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
  return { generateText: async () => response };
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
    randomId: () => `rt-test-${Date.now()}`,
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

describe('create_presentation tool wrapper', () => {
  it('returns success with artifacts for valid prompt', async () => {
    const outputDir = join(tmpdir(), 'pa-rt-tool-success');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      {
        prompt: 'テスト資料を作成',
        outputDir,
        styleGuide: FONT_POLICY_STYLE_GUIDE,
      },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
    expect(result.pptxPath).toBeTruthy();
    expect(result.pptxPath && existsSync(result.pptxPath)).toBe(true);
    expect(result.artifacts.some((a) => a.kind === 'pptx')).toBe(true);
    expect(result.artifacts.some((a) => a.kind === 'work-dir')).toBe(true);
    expect(result.summary).toBeTruthy();
  }, 30_000);

  it('defaults diagnostics and revision to true', async () => {
    const outputDir = join(tmpdir(), 'pa-rt-defaults');
    cleanupDirs.push(outputDir);

    const result = await createPresentation(
      { prompt: 'テスト', outputDir },
      makeDeps(FAKE_PPTX_SCRIPT, fakeDiagnosticsPass()),
    );

    expect(result.success).toBe(true);
    expect(result.diagnosticsStatus).toBe('pass');
    expect(result.revisionReason).toBe('diagnostics-pass');
  }, 30_000);

  it('returns structured failure for empty prompt', async () => {
    const result = await createPresentation({ prompt: '' }, makeDeps(FAKE_PPTX_SCRIPT));

    expect(result.success).toBe(false);
    expect(result.error?.phase).toBe('input-validation');
  });
});

describe('font policy', () => {
  it('style guide includes required font names', () => {
    expect(FONT_POLICY_STYLE_GUIDE).toContain('BIZ UDPGothic');
    expect(FONT_POLICY_STYLE_GUIDE).toContain('BIZ UDGothic');
    expect(FONT_POLICY_STYLE_GUIDE).toContain('BIZ UDPMincho');
    expect(FONT_POLICY_STYLE_GUIDE).toContain('Arial');
    expect(FONT_POLICY_STYLE_GUIDE).toContain('Georgia');
  });

  it('presets include standard, readable, product-lp, research-elegant, table-numeric', () => {
    expect(FONT_PRESETS.standard).toBeDefined();
    expect(FONT_PRESETS.readable).toBeDefined();
    expect(FONT_PRESETS['product-lp']).toBeDefined();
    expect(FONT_PRESETS['research-elegant']).toBeDefined();
    expect(FONT_PRESETS['table-numeric']).toBeDefined();
  });

  it('standard preset uses BIZ UDPGothic + Arial', () => {
    const standard = FONT_PRESETS.standard;
    expect(standard).toBeDefined();
    expect(standard?.japanese).toBe('BIZ UDPGothic');
    expect(standard?.latin).toBe('Arial');
  });
});

describe('slide agent system prompt', () => {
  it('includes font policy references', () => {
    expect(SLIDE_AGENT_SYSTEM_PROMPT).toContain('BIZ UDPGothic');
    expect(SLIDE_AGENT_SYSTEM_PROMPT).toContain('BIZ UDGothic');
    expect(SLIDE_AGENT_SYSTEM_PROMPT).toContain('Arial');
  });

  it('instructs to use create_presentation tool', () => {
    expect(SLIDE_AGENT_SYSTEM_PROMPT).toContain('create_presentation');
  });

  it('mentions Japanese output preference', () => {
    expect(SLIDE_AGENT_SYSTEM_PROMPT).toContain('Japanese');
  });
});
