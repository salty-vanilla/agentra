#!/usr/bin/env tsx
/**
 * Live AgentCore manufacturing-line RAG/tools smoke script.
 *
 * Calls the deployed AgentCore Runtime directly to verify the manufacturing-line
 * RAG path: KB retrieval, structured RAG, and tool observations.
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   AWS_REGION=ap-northeast-1 AGENTCORE_RUNTIME_ARN=arn:... pnpm smoke:agentcore:mfg
 *   SMOKE_STRICT=true ... pnpm smoke:agentcore:mfg   # fail if no KB/structured-RAG tools observed
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
 *   SMOKE_STRICT                  true to fail if no KB/RAG tools observed
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
  '温度異常エラー発生時の対応手順を教えてください。根拠も示してください。';

const KB_TOOL_PATTERN = /^kb_/;
const STRUCTURED_TOOL_PATTERN = /^structured_/;

async function main(): Promise<void> {
  const baseConfig = readConfig('AGENTCORE_RUNTIME_ARN');
  const { prompt, config } = parseArgs(DEFAULT_PROMPT, baseConfig);

  console.log(`[smoke] target=main-runtime (manufacturing-line path)`);
  console.log(`[smoke] strict=${config.strict}`);
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

  const observedTools = [...stats.toolNames];
  const kbToolsFound = observedTools.some((t) => KB_TOOL_PATTERN.test(t));
  const structuredToolsFound = observedTools.some((t) => STRUCTURED_TOOL_PATTERN.test(t));

  console.log('--- tool analysis ---');
  console.log(`kb_* tools observed      : ${kbToolsFound ? 'yes' : 'no'}`);
  console.log(`structured_* tools observed: ${structuredToolsFound ? 'yes' : 'no'}`);

  printSummary(config, stats);

  const runtimeFailed = !gotDone || stats.eventCounts.error > 0;
  const strictFailed = config.strict && !kbToolsFound && !structuredToolsFound;

  if (runtimeFailed) {
    console.error('[smoke] FAIL: runtime error or no done event');
    process.exit(1);
  }
  if (strictFailed) {
    console.error('[smoke] FAIL: strict mode - no KB or structured-RAG tools observed');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('[smoke] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
