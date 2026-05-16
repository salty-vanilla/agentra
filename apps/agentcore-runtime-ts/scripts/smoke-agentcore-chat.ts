#!/usr/bin/env tsx
/**
 * Live AgentCore chat smoke script.
 *
 * Calls the deployed AgentCore Runtime directly (no frontend, API Gateway, or BFF).
 * Use this to verify the runtime responds and streams text before investigating
 * transport-layer issues (SSE timeout, Lambda Web Adapter, API Gateway).
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   AWS_REGION=ap-northeast-1 AGENTCORE_RUNTIME_ARN=arn:... pnpm smoke:agentcore:chat
 *   AWS_REGION=ap-northeast-1 AGENTCORE_RUNTIME_ARN=arn:... pnpm smoke:agentcore:chat -- --prompt "hello"
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

const DEFAULT_PROMPT = 'こんにちは。あなたが利用できる主な機能を簡単に説明してください。';

async function main(): Promise<void> {
  const baseConfig = readConfig('AGENTCORE_RUNTIME_ARN');
  const { prompt, config } = parseArgs(DEFAULT_PROMPT, baseConfig);

  console.log(`[smoke] target=main-runtime`);
  console.log(`[smoke] prompt=${prompt}`);
  console.log('');
  console.log('--- response ---');

  const payload = buildPayload(config, prompt);
  let stats = initialStats();
  let gotDone = false;

  for await (const event of streamRuntime(config, payload)) {
    stats = accumulateEvent(stats, event);
    if (event.type === 'text') {
      process.stdout.write(event.text);
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
  printSummary(config, stats);

  if (!gotDone || stats.eventCounts.error > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('[smoke] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
