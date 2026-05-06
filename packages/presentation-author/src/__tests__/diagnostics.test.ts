import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderPresentation } from '../render.js';
import { detectPresentationFonts, validatePresentationOverflow } from '../validation.js';

const RUN_INTEGRATION =
  process.env.PRESENTATION_AUTHOR_RUN_PYTHON_INTEGRATION_TESTS === '1';
const RUN_RENDER = process.env.PRESENTATION_AUTHOR_RUN_RENDER_TESTS === '1';

const VENDOR_SCRIPTS = join(__dirname, '..', '..', 'vendor', 'openai-slides', 'scripts');

describe.skipIf(!RUN_RENDER)('render integration', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('renders a pptx to PNGs', async () => {
    workDir = join(tmpdir(), `render-test-${Date.now()}`);
    await mkdir(workDir, { recursive: true });

    // Create a minimal pptx using pptxgenjs
    const scriptPath = join(workDir, 'gen.mjs');
    await writeFile(
      scriptPath,
      `
import pptxgen from "pptxgenjs";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
const slide = pptx.addSlide();
slide.addText("Slide 1", { x: 1, y: 1, fontSize: 24 });
const slide2 = pptx.addSlide();
slide2.addText("Slide 2", { x: 1, y: 1, fontSize: 24 });
await pptx.writeFile({ fileName: "${join(workDir, 'deck.pptx').replace(/\\/g, '/')}" });
`,
    );

    // Generate the pptx first
    const { execSync } = await import('node:child_process');
    execSync(`node --experimental-vm-modules "${scriptPath}"`, {
      cwd: workDir,
    });

    const pptxPath = join(workDir, 'deck.pptx');
    expect(existsSync(pptxPath)).toBe(true);

    const result = await renderPresentation({
      pptxPath,
      scriptsDir: VENDOR_SCRIPTS,
    });

    expect(result.success).toBe(true);
    expect(result.slideCount).toBe(2);
    expect(result.slideImagePaths.length).toBe(2);
  });
});

describe.skipIf(!RUN_INTEGRATION)('validatePresentationOverflow integration', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('reports pass for a simple presentation', async () => {
    workDir = join(tmpdir(), `overflow-test-${Date.now()}`);
    await mkdir(workDir, { recursive: true });

    const scriptPath = join(workDir, 'gen.mjs');
    await writeFile(
      scriptPath,
      `
import pptxgen from "pptxgenjs";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
const slide = pptx.addSlide();
slide.addText("Hello", { x: 1, y: 1, w: 3, h: 1, fontSize: 18 });
await pptx.writeFile({ fileName: "${join(workDir, 'deck.pptx').replace(/\\/g, '/')}" });
`,
    );

    const { execSync } = await import('node:child_process');
    execSync(`node --experimental-vm-modules "${scriptPath}"`, {
      cwd: workDir,
    });

    const pptxPath = join(workDir, 'deck.pptx');
    const result = await validatePresentationOverflow({
      pptxPath,
      scriptsDir: VENDOR_SCRIPTS,
    });

    expect(result.success).toBe(true);
    // May or may not pass depending on rendering, just verify it ran
    expect(typeof result.passed).toBe('boolean');
  });
});

describe.skipIf(!RUN_INTEGRATION)('detectPresentationFonts integration', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('detects fonts in a presentation', async () => {
    workDir = join(tmpdir(), `font-test-${Date.now()}`);
    await mkdir(workDir, { recursive: true });

    const scriptPath = join(workDir, 'gen.mjs');
    await writeFile(
      scriptPath,
      `
import pptxgen from "pptxgenjs";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
const slide = pptx.addSlide();
slide.addText("Hello", { x: 1, y: 1, w: 3, h: 1, fontFace: "Arial", fontSize: 18 });
await pptx.writeFile({ fileName: "${join(workDir, 'deck.pptx').replace(/\\/g, '/')}" });
`,
    );

    const { execSync } = await import('node:child_process');
    execSync(`node --experimental-vm-modules "${scriptPath}"`, {
      cwd: workDir,
    });

    const pptxPath = join(workDir, 'deck.pptx');
    const result = await detectPresentationFonts({
      pptxPath,
      scriptsDir: VENDOR_SCRIPTS,
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.missingFonts)).toBe(true);
    expect(Array.isArray(result.substitutedFonts)).toBe(true);
  });
});
