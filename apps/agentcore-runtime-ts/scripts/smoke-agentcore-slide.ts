#!/usr/bin/env tsx
/**
 * Live AgentCore slide generation smoke script.
 *
 * Tests the main-runtime → create_slide_presentation tool → slide runtime path.
 * Does NOT invoke the slide runtime directly (different payload/accept contract).
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   AWS_REGION=ap-northeast-1 AGENTCORE_RUNTIME_ARN=arn:... pnpm smoke:agentcore:slide
 *   SMOKE_STRICT=true ... pnpm smoke:agentcore:slide   # fail if no slide artifact signal found
 *
 * Env vars:
 *   AWS_REGION                    (default: ap-northeast-1)
 *   AGENTCORE_RUNTIME_ARN         (required)
 *   AGENTCORE_RUNTIME_QUALIFIER   (optional)
 *   SMOKE_MODEL                   opus|sonnet|haiku (default: sonnet)
 *   SMOKE_USER_ID                 (default: smoke-user-local)
 *   SMOKE_THREAD_ID               (default: generated uuidv7)
 *   SMOKE_TRACE_ID                (default: generated uuidv7)
 *   SMOKE_TIMEOUT_MS              (default: 300000)
 *   SMOKE_STRICT                  true to fail if no slide artifact signal found
 */
import {
  accumulateEvent,
  buildPayload,
  initialStats,
  parseArgs,
  printSummary,
  readConfig,
  streamRuntime,
} from './smoke-utils.js';

const DEFAULT_PROMPT =
  '温度異常の初動対応を説明する5枚の報告スライドを作成してください。';

const SLIDE_ARTIFACT_PATTERNS = [
  /\.pptx/i,
  /\.html/i,
  /presigned.*url/i,
  /s3.*key/i,
  /download/i,
  /slide.*generat/i,
  /スライド.*作成/,
  /プレゼンテーション.*完成/,
];

function buildSlideCommandDirective(prompt: string): string {
  return [
    '<UI command directive>',
    'The user explicitly requested slide generation via the chat UI command.',
    '',
    'Command:',
    `- type: create_slide_presentation`,
    `- topic: ${prompt}`,
    `- outputFormat: pptx`,
    '',
    'You must delegate this request to the create_slide_presentation tool.',
    'Do not answer with a normal text-only response.',
    'Do not generate PPTX XML yourself.',
    '</UI command directive>',
  ].join('\n');
}

async function main(): Promise<void> {
  const config = readConfig('AGENTCORE_RUNTIME_ARN');
  const { prompt, config: finalConfig } = parseArgs(DEFAULT_PROMPT, config);

  console.log('[smoke] target=main-runtime (slide path)');
  console.log(`[smoke] strict=${finalConfig.strict}`);
  console.log(`[smoke] prompt=${prompt}`);
  console.log('');
  console.log('--- response ---');

  const commandDirective = buildSlideCommandDirective(prompt);
  const payload = buildPayload(finalConfig, prompt, commandDirective);

  let stats = initialStats();
  let gotDone = false;
  let responseText = '';

  for await (const event of streamRuntime(finalConfig, payload)) {
    stats = accumulateEvent(stats, event);
    if (event.type === 'text') {
      process.stdout.write(event.text);
      responseText += event.text;
    } else if (event.type === 'observation') {
      const tools = event.observation.toolCalls.map((tc) => tc.toolName).join(', ');
      console.log(
        `\n[observation] status=${event.observation.status} durationMs=${event.observation.durationMs} tools=${tools || '(none)'}`,
      );
    } else if (event.type === 'done') {
      gotDone = true;
    } else if (event.type === 'error') {
      console.error(`\n[error] ${event.error}`);
    }
  }

  console.log('');

  const artifactFound = SLIDE_ARTIFACT_PATTERNS.some((pattern) =>
    pattern.test(responseText),
  );
  const slideToolObserved = stats.toolNames.some(
    (t) => t.includes('slide') || t.includes('presentation'),
  );

  console.log('--- artifact analysis ---');
  console.log(`slide artifact signal found: ${artifactFound ? 'yes' : 'no'}`);
  console.log(`slide-related tool observed: ${slideToolObserved ? 'yes' : 'no'}`);

  printSummary(finalConfig, stats);

  const runtimeFailed = !gotDone || stats.eventCounts.error > 0;
  const strictFailed = finalConfig.strict && !artifactFound && !slideToolObserved;

  if (runtimeFailed) {
    console.error('[smoke] FAIL: runtime error or no done event');
    process.exit(1);
  }
  if (strictFailed) {
    console.error('[smoke] FAIL: strict mode - no slide artifact signal found');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('[smoke] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
