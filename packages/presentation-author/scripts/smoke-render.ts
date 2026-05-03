#!/usr/bin/env tsx
/**
 * Smoke test: renders a pptx generated in-memory and creates a contact sheet.
 *
 * Usage:
 *   PRESENTATION_AUTHOR_RUN_RENDER_TESTS=1 npx tsx packages/presentation-author/scripts/smoke-render.ts
 *
 * Requirements: LibreOffice + poppler-utils + Python deps installed.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContactSheet } from '../src/contact-sheet.js';
import { renderPresentation } from '../src/render.js';

const VENDOR_SCRIPTS = join(__dirname, '..', 'vendor', 'openai-slides', 'scripts');

async function main() {
  const workDir = join(tmpdir(), `smoke-render-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  // Generate a test pptx
  const genScript = join(workDir, 'gen.mjs');
  writeFileSync(
    genScript,
    `
import pptxgen from "pptxgenjs";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
for (let i = 1; i <= 4; i++) {
  const slide = pptx.addSlide();
  slide.addText(\`Slide \${i}\`, { x: 1, y: 1, fontSize: 32 });
}
await pptx.writeFile({ fileName: "${join(workDir, 'deck.pptx').replace(/\\/g, '/')}" });
`,
  );

  execSync(`node --experimental-vm-modules "${genScript}"`, {
    cwd: workDir,
    stdio: 'inherit',
  });

  const pptxPath = join(workDir, 'deck.pptx');
  if (!existsSync(pptxPath)) {
    console.error('Failed to generate deck.pptx');
    process.exit(1);
  }

  console.log('Rendering slides...');
  const renderResult = await renderPresentation({
    pptxPath,
    scriptsDir: VENDOR_SCRIPTS,
  });

  console.log(
    `Render: success=${renderResult.success}, slides=${renderResult.slideCount}`,
  );
  if (!renderResult.success) {
    console.error('Render failed:', renderResult.stderr);
    process.exit(1);
  }

  console.log('Creating contact sheet...');
  const csResult = await createContactSheet({
    inputDir: renderResult.renderDir,
    scriptsDir: VENDOR_SCRIPTS,
  });

  console.log(
    `Contact sheet: success=${csResult.success}, path=${csResult.contactSheetPath}`,
  );
  if (!csResult.success) {
    console.error('Contact sheet failed:', csResult.stderr);
    process.exit(1);
  }

  console.log('Smoke test passed!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
