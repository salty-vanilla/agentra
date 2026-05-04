/**
 * Fake LLM dogfood: generates a PPTX without calling Bedrock.
 * Validates the full pipeline (script exec, render, contact sheet, diagnostics)
 * inside a Docker container or locally.
 *
 * Usage:
 *   PRESENTATION_AUTHOR_DOGFOOD_FAKE_LLM=true node dist/scripts/dogfood-fake-llm.js
 *   or: tsx src/scripts/dogfood-fake-llm.ts
 */

import type { LlmClient } from '@agentra/presentation-author';
import { createPresentation } from '@agentra/presentation-author';

const FAKE_PPTXGENJS_SCRIPT = `
const pptxgen = require("pptxgenjs");
const pres = new pptxgen();

// Slide 1: Title
const slide1 = pres.addSlide();
slide1.background = { fill: "1a2b3c" };
slide1.addText("製造ライン #4 Q2報告", {
  x: 0.5, y: 1.5, w: 9, h: 1.5,
  fontSize: 36, color: "FFFFFF", bold: true,
  align: "center", fontFace: "Arial",
});
slide1.addText("2024年 第2四半期", {
  x: 0.5, y: 3.5, w: 9, h: 0.8,
  fontSize: 18, color: "CCCCCC", align: "center", fontFace: "Arial",
});

// Slide 2: KPIs
const slide2 = pres.addSlide();
slide2.addText("主要KPI", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 28, bold: true, color: "333333", fontFace: "Arial",
});
slide2.addText("稼働率: 94.2%\\n不良率: 1.8%\\n生産数: 12,450台", {
  x: 0.5, y: 1.5, w: 9, h: 3,
  fontSize: 20, color: "444444", fontFace: "Arial",
  valign: "top",
});

// Slide 3: Summary
const slide3 = pres.addSlide();
slide3.addText("まとめ・次期アクション", {
  x: 0.5, y: 0.3, w: 9, h: 0.8,
  fontSize: 28, bold: true, color: "333333", fontFace: "Arial",
});
slide3.addText("• 設備点検頻度の増加で稼働率改善\\n• 品質管理プロセスの自動化推進\\n• Q3目標: 不良率1.5%以下", {
  x: 0.5, y: 1.5, w: 9, h: 3,
  fontSize: 18, color: "444444", fontFace: "Arial",
  valign: "top",
});

const outputPath = process.env.__PPTX_OUTPUT_PATH || "deck.pptx";
pres.writeFile({ fileName: outputPath })
  .then(() => console.log("Written: " + outputPath))
  .catch((err) => { console.error(err); process.exit(1); });
`;

function createFakeLlmClient(): LlmClient {
  return {
    generateText: async (_input) => {
      // Return the fake script wrapped as the LLM would
      return FAKE_PPTXGENJS_SCRIPT;
    },
  };
}

const outputDir =
  process.env.PRESENTATION_AUTHOR_OUTPUT_DIR ?? '/tmp/presentation-author/fake-smoke';

async function main() {
  console.log('=== Fake LLM Dogfood ===');
  console.log(`Output: ${outputDir}`);
  console.log();

  const llm = createFakeLlmClient();
  const startMs = performance.now();

  const result = await createPresentation(
    {
      prompt: '製造ライン #4 のQ2報告資料を3枚で作成してください。',
      language: 'ja',
      outputDir,
      diagnostics: process.env.PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS !== 'false',
      revision: false,
    },
    { llm },
  );

  const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Success: ${result.success}`);

  if (result.success) {
    console.log(`PPTX: ${result.pptxPath}`);
    console.log(`Source: ${result.sourceJsPath}`);
    console.log(`Contact sheet: ${result.contactSheetPath ?? 'N/A'}`);
    console.log(`Rendered slides: ${result.renderedSlidePaths?.length ?? 0}`);
    console.log(`Diagnostics: ${result.diagnosticsStatus ?? 'N/A'}`);
    console.log(`Warnings: ${result.warnings?.length ?? 0}`);
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) console.log(`  - ${w}`);
    }
    console.log('\nFake LLM smoke PASSED.');
  } else {
    console.error(`FAILED at phase: ${result.error?.phase}`);
    console.error(`Message: ${result.error?.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
