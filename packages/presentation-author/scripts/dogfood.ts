#!/usr/bin/env tsx
import { resolve } from 'node:path';
/**
 * PA-4.5 Dogfooding smoke script.
 *
 * Runs a fixed Japanese manufacturing report prompt with diagnostics + revision
 * against a real Bedrock LLM. Requires:
 *   - AWS credentials (profile or env)
 *   - LibreOffice + poppler-utils + Python deps
 *
 * Usage:
 *   npx tsx packages/presentation-author/scripts/dogfood.ts
 *
 * Env overrides:
 *   BEDROCK_MODEL_ID   — model to use (default: global.anthropic.claude-sonnet-4-6)
 *   AWS_REGION          — Bedrock region (default: us-east-1)
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { runPresentationAuthor } from '../src/index.js';
import type { LlmClient } from '../src/types.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'global.anthropic.claude-sonnet-4-6';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const OUTPUT_DIR = resolve('.tmp/presentation-author-dogfood');

const PROMPT = `
製造ライン #4 のQ2実績報告資料を作成してください。

## 概要
- 対象期間: 2026年1月～3月（Q2）
- 対象: 製造ライン #4（精密部品加工）
- 報告先: 製造部長・品質管理部

## 含めるべき内容
1. タイトルスライド
2. エグゼクティブサマリー（稼働率 92.3%、不良率 0.8%、生産数 124,500個）
3. 月別生産実績の棒グラフ（1月: 38,200 / 2月: 41,800 / 3月: 44,500）
4. 品質指標トレンド（不良率推移: 1月 1.2% → 2月 0.7% → 3月 0.5%）
5. 設備稼働率（計画 95% vs 実績 92.3% — 2月のチラー故障による3日間停止が影響）
6. 改善活動まとめ（TPM活動、段取り時間短縮、ポカヨケ導入）
7. 次期アクションプラン
`.trim();

function createBedrockLlm(): LlmClient {
  const client = new BedrockRuntimeClient({ region: REGION });

  return {
    async generateText({ prompt, system }) {
      const messages: { role: string; content: string }[] = [
        { role: 'user', content: prompt },
      ];

      const body: Record<string, unknown> = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 16384,
        messages,
      };
      if (system) {
        body.system = system;
      }

      const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await client.send(command);
      const parsed = JSON.parse(new TextDecoder().decode(response.body)) as {
        content: { type: string; text: string }[];
      };

      return parsed.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');
    },
  };
}

async function main() {
  console.log('=== PA-4.5 Dogfooding Smoke ===');
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Region: ${REGION}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('');

  const start = performance.now();

  const result = await runPresentationAuthor(
    {
      prompt: PROMPT,
      language: 'ja',
      diagnostics: true,
      revision: true,
      outputDir: OUTPUT_DIR,
    },
    {
      llm: createBedrockLlm(),
    },
  );

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);

  console.log(`--- Results (${elapsed}s) ---`);
  console.log(`workDir:          ${result.workDir}`);
  console.log(`pptxPath:         ${result.pptxPath}`);
  console.log(`sourceJsPath:     ${result.sourceJsPath}`);

  if (result.diagnostics?.contactSheet?.success) {
    console.log(`contactSheetPath: ${result.diagnostics.contactSheet.contactSheetPath}`);
  }

  console.log('');
  console.log(`diagnostics:      ${result.diagnostics?.status ?? 'not run'}`);

  if (result.diagnostics?.overflow) {
    const ov = result.diagnostics.overflow;
    console.log(
      `  overflow:       ${ov.passed ? 'pass' : `FAIL (slides: ${ov.overflowSlideNumbers.join(', ')})`}`,
    );
  }
  if (result.diagnostics?.render) {
    console.log(
      `  render:         ${result.diagnostics.render.success ? `${result.diagnostics.render.slideCount} slides` : 'FAILED'}`,
    );
  }

  console.log('');
  if (result.revision) {
    console.log(
      `revision:         attempted=${result.revision.attempted} succeeded=${result.revision.succeeded} reason=${result.revision.reason}`,
    );
  } else {
    console.log('revision:         not enabled');
  }

  if (result.warnings.length > 0) {
    console.log('');
    console.log(`warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }

  console.log('');
  console.log('Done. Inspect:');
  console.log(`  open ${result.pptxPath}`);
  if (result.diagnostics?.contactSheet?.success) {
    console.log(`  open ${result.diagnostics.contactSheet.contactSheetPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
