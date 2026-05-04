#!/usr/bin/env tsx
/**
 * PA-6 Dogfooding: invoke create_presentation tool directly
 * with the manufacturing-line Q2 report fixture.
 *
 * Usage:
 *   pnpm --filter @agentra/presentation-author-runtime dogfood:presentation
 *
 * Env overrides:
 *   PRESENTATION_AUTHOR_MODEL_ID — model for script generation (default: us.anthropic.claude-sonnet-4-6)
 *   AWS_REGION                   — Bedrock region (default: us-east-1)
 *   PRESENTATION_AUTHOR_OUTPUT_DIR — output directory
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPresentation } from '@agentra/presentation-author';
import { FONT_POLICY_STYLE_GUIDE } from '../src/font-policy.js';
import { createPresentationAuthorLlmClient } from '../src/llm-adapter.js';

const FIXTURE_DIR = resolve(
  import.meta.dirname,
  '../../packages/presentation-author/fixtures/manufacturing-line-q2-report',
);

const prompt = readFileSync(resolve(FIXTURE_DIR, 'prompt.md'), 'utf-8').trim();

const outputDir =
  process.env.PRESENTATION_AUTHOR_OUTPUT_DIR ??
  resolve('.tmp/agentcore-presentation-author-dogfood');

async function main() {
  console.log('=== PA-6 Dogfood: create_presentation ===');
  console.log(`Output: ${outputDir}`);
  console.log();

  const llm = createPresentationAuthorLlmClient();

  const startMs = performance.now();
  const result = await createPresentation(
    {
      prompt,
      language: 'ja',
      styleGuide: FONT_POLICY_STYLE_GUIDE,
      outputDir,
      diagnostics: true,
      revision: true,
    },
    { llm },
  );
  const elapsed = ((performance.now() - startMs) / 1000).toFixed(1);

  console.log(`--- Results (${elapsed}s) ---`);
  console.log(`success:          ${result.success}`);
  console.log(`summary:          ${result.summary}`);
  console.log(`workDir:          ${result.workDir}`);
  console.log(`pptxPath:         ${result.pptxPath ?? '(none)'}`);
  console.log(`sourceJsPath:     ${result.sourceJsPath ?? '(none)'}`);
  console.log(`contactSheetPath: ${result.contactSheetPath ?? '(none)'}`);
  console.log();
  console.log(`diagnostics:      ${result.diagnosticsStatus ?? '(not run)'}`);
  console.log(
    `revision:         attempted=${result.revisionAttempted ?? false} succeeded=${result.revisionSucceeded ?? false} reason=${result.revisionReason ?? '(none)'}`,
  );

  if (result.warnings.length > 0) {
    console.log();
    console.log(`warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (result.error) {
    console.log();
    console.log(`error.phase:   ${result.error.phase}`);
    console.log(`error.message: ${result.error.message}`);
  }

  console.log();
  console.log(`artifacts (${result.artifacts.length}):`);
  for (const a of result.artifacts) {
    console.log(`  [${a.kind}] ${a.path} (exists=${a.exists})`);
  }

  console.log();
  if (result.success && result.pptxPath) {
    console.log(`Done. Inspect:`);
    console.log(`  open ${result.pptxPath}`);
  } else {
    console.log('Generation failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
