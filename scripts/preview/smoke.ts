/**
 * `pnpm preview:smoke --stage <preview-stage> [--manifest <path>] [--mode core|full]
 *  [--with-log-correlation]`
 *
 * Reads `.agentra/preview/<stage>/manifest.json` (or an explicit --manifest path)
 * and runs a fast liveness smoke against the deployed preview environment. By
 * default (`--mode core`) it runs only the cheap GET checks: BFF `/health` and the
 * authenticated `/threads`. Pass `--mode full` to also run the heavy checks —
 * `/chat` SSE to a terminal `done` (extracting requestId/traceId/threadId) and
 * (on backend-ai / full profiles) an AgentCore invoke — and `--with-log-correlation`
 * to correlate the `/chat` requestId with AgentCore Runtime CloudWatch Logs. Writes
 * a machine-readable `.agentra/preview/<stage>/smoke-result.json` and exits non-zero
 * on failure.
 *
 * This command performs NO deploy or destroy. Auth uses SMOKE_JWT_TOKEN; checks
 * that require auth skip with an explicit reason when it is absent. No real test
 * users are created.
 */
import { existsSync } from 'node:fs';
import { ensurePreviewDir, readJsonFile, writeJsonFile } from './io.js';
import { manifestPath, smokeResultPath } from './paths.js';
import { validatePreviewStage } from './preview-stage.js';
import { loadSmokeManifest, runSmoke, type SmokeRuntime } from './run-smoke.js';
import { parseSmokeArgs } from './smoke-args.js';
import { resolveLogGroupNames } from './smoke-checks.js';
import { searchCloudWatchLogsByRequestId } from './smoke-cloudwatch.js';
import { consumeSse, httpProbe, invokeAgentCore } from './smoke-runtime.js';

const DEFAULT_PROMPT = 'こんにちは。何かお手伝いできますか？';
const DEFAULT_AGENTCORE_QUALIFIER = 'prod';
const DEFAULT_AGENTCORE_TIMEOUT_MS = 120_000;
const DEFAULT_LOG_WAIT_SECONDS = 60;
const DEFAULT_LOG_POLL_INTERVAL_SECONDS = 5;

function resolveAgentCoreQualifier(): string {
  return (
    process.env.AGENTCORE_RUNTIME_QUALIFIER?.trim() ||
    process.env.SMOKE_AGENTCORE_QUALIFIER?.trim() ||
    DEFAULT_AGENTCORE_QUALIFIER
  );
}

function resolveAgentCoreTimeoutMs(): number {
  const parsed = Number(process.env.SMOKE_AGENTCORE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGENTCORE_TIMEOUT_MS;
}

function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/** Read a positive-seconds env var into milliseconds, falling back to a default. */
function resolveSecondsMs(value: string | undefined, defaultSeconds: number): number {
  const parsed = Number(value);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSeconds;
  return seconds * 1_000;
}

async function main(): Promise<void> {
  const args = parseSmokeArgs(process.argv.slice(2));
  validatePreviewStage(args.stage);
  const { stage } = args;

  const file = args.manifest ?? manifestPath(stage);
  const manifest = loadSmokeManifest(file, stage, {
    exists: existsSync,
    readJson: readJsonFile,
  });

  const logCorrelationEnabled =
    args.withLogCorrelation || isTruthyEnv(process.env.SMOKE_LOG_CORRELATION);

  const runtime: SmokeRuntime = {
    httpProbe,
    consumeSse,
    invokeAgentCore,
    searchCloudWatchLogsByRequestId,
    authToken: process.env.SMOKE_JWT_TOKEN?.trim() || undefined,
    region: manifest.region ?? process.env.AWS_REGION ?? null,
    prompt: process.env.SMOKE_PROMPT?.trim() || DEFAULT_PROMPT,
    threadId: process.env.SMOKE_THREAD_ID?.trim() || undefined,
    agentCoreQualifier: resolveAgentCoreQualifier(),
    agentCoreTimeoutMs: resolveAgentCoreTimeoutMs(),
    mode: args.mode,
    logCorrelationEnabled,
    logGroupNames: resolveLogGroupNames(
      manifest.outputs,
      process.env.SMOKE_CLOUDWATCH_LOG_GROUP_NAMES,
    ),
    logWaitMs: resolveSecondsMs(
      process.env.SMOKE_LOG_WAIT_SECONDS,
      DEFAULT_LOG_WAIT_SECONDS,
    ),
    logPollIntervalMs: resolveSecondsMs(
      process.env.SMOKE_LOG_POLL_INTERVAL_SECONDS,
      DEFAULT_LOG_POLL_INTERVAL_SECONDS,
    ),
    now: () => new Date(),
    log: (message) => console.log(message),
  };

  const result = await runSmoke(manifest, runtime);

  ensurePreviewDir(stage);
  const resultPath = smokeResultPath(stage);
  writeJsonFile(resultPath, result);

  console.log(
    `[preview:smoke] ${result.status.toUpperCase()} ` +
      `passed=${result.summary.passed} failed=${result.summary.failed} ` +
      `skipped=${result.summary.skipped}`,
  );
  console.log(`[preview:smoke] Wrote ${resultPath}`);

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    `preview:smoke failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
