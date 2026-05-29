/**
 * `pnpm preview:smoke --stage <preview-stage> [--manifest <path>]`
 *
 * Reads `.agentra/preview/<stage>/manifest.json` (or an explicit --manifest path)
 * and runs a fast liveness smoke against the deployed preview environment:
 * BFF `/health`, authenticated `/threads`, `/chat` SSE to a terminal event, and
 * (on backend-ai / full profiles) an AgentCore invoke. Writes a machine-readable
 * `.agentra/preview/<stage>/smoke-result.json` and exits non-zero on failure.
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
import { consumeSse, httpProbe, invokeAgentCore } from './smoke-runtime.js';

const DEFAULT_PROMPT = 'こんにちは。何かお手伝いできますか？';
const DEFAULT_AGENTCORE_QUALIFIER = 'prod';
const DEFAULT_AGENTCORE_TIMEOUT_MS = 120_000;

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

async function main(): Promise<void> {
  const args = parseSmokeArgs(process.argv.slice(2));
  validatePreviewStage(args.stage);
  const { stage } = args;

  const file = args.manifest ?? manifestPath(stage);
  const manifest = loadSmokeManifest(file, stage, {
    exists: existsSync,
    readJson: readJsonFile,
  });

  const runtime: SmokeRuntime = {
    httpProbe,
    consumeSse,
    invokeAgentCore,
    authToken: process.env.SMOKE_JWT_TOKEN?.trim() || undefined,
    region: manifest.region ?? process.env.AWS_REGION ?? null,
    prompt: process.env.SMOKE_PROMPT?.trim() || DEFAULT_PROMPT,
    threadId: process.env.SMOKE_THREAD_ID?.trim() || undefined,
    agentCoreQualifier: resolveAgentCoreQualifier(),
    agentCoreTimeoutMs: resolveAgentCoreTimeoutMs(),
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
