/**
 * Testable orchestrator for `pnpm preview:smoke`.
 *
 * All side effects (HTTP, SSE consumption, AgentCore invocation, clock, logging)
 * are injected via `SmokeRuntime` so the check selection and result aggregation
 * are unit-testable without live AWS or network. The real runtime is assembled
 * in smoke.ts; this module owns the pure orchestration.
 */
import type { PreviewManifest } from './manifest.js';
import {
  checkAgentCore,
  checkChatSse,
  checkHealth,
  checkThreads,
} from './smoke-checks.js';
import {
  buildSmokeResult,
  type SmokeCheckResult,
  type SmokeResult,
} from './smoke-report.js';
import type { SseEventName } from './smoke-sse.js';

/** Result of a single HTTP probe (GET /health, GET /threads). */
export interface HttpProbeResult {
  status: number;
  latencyMs: number;
  bodyJson?: unknown;
  error?: string;
  timedOut: boolean;
}

/** Result of consuming a `/chat` SSE stream to a terminal event or timeout. */
export interface SseProbeResult {
  opened: boolean;
  events: SseEventName[];
  gotTerminal: boolean;
  terminalIsSuccess: boolean;
  latencyMs: number;
  timedOut: boolean;
  error?: string;
}

export interface AgentCoreProbeParams {
  arn: string;
  qualifier: string | undefined;
  region: string | null;
  prompt: string;
  timeoutMs: number;
}

export interface AgentCoreProbeResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  timedOut: boolean;
}

/**
 * Injected dependencies for the smoke checks: side-effecting probes plus the
 * resolved configuration (auth token, prompt, region, AgentCore qualifier and
 * timeout) the checks read.
 */
export interface SmokeRuntime {
  httpProbe: (
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ) => Promise<HttpProbeResult>;
  consumeSse: (
    url: string,
    body: unknown,
    headers: Record<string, string>,
    timeoutMs: number,
  ) => Promise<SseProbeResult>;
  invokeAgentCore: (params: AgentCoreProbeParams) => Promise<AgentCoreProbeResult>;
  authToken: string | undefined;
  region: string | null;
  prompt: string;
  threadId: string | undefined;
  agentCoreQualifier: string | undefined;
  agentCoreTimeoutMs: number;
  now: () => Date;
  log: (message: string) => void;
}

/** Filesystem dependencies for loading the manifest, injectable for tests. */
export interface ManifestFsDeps {
  exists: (path: string) => boolean;
  readJson: <T>(path: string) => T;
}

/**
 * Load and minimally validate the preview manifest. Throws a clear error when
 * the manifest is missing or structurally unusable (no stage / no outputs).
 */
export function loadSmokeManifest(
  manifestPath: string,
  deps: ManifestFsDeps,
): PreviewManifest {
  if (!deps.exists(manifestPath)) {
    throw new Error(
      `No preview manifest at ${manifestPath}. ` +
        'Run "pnpm preview:deploy" and "pnpm preview:outputs" first, ' +
        'or pass --manifest <path>.',
    );
  }
  const manifest = deps.readJson<PreviewManifest>(manifestPath);
  if (!manifest || typeof manifest.stage !== 'string' || manifest.stage.length === 0) {
    throw new Error(`Manifest at ${manifestPath} is missing a "stage".`);
  }
  if (manifest.outputs === null || typeof manifest.outputs !== 'object') {
    throw new Error(`Manifest at ${manifestPath} is missing an "outputs" object.`);
  }
  return manifest;
}

const CHECKS: ReadonlyArray<
  (manifest: PreviewManifest, runtime: SmokeRuntime) => Promise<SmokeCheckResult>
> = [checkHealth, checkThreads, checkChatSse, checkAgentCore];

/**
 * Run all applicable smoke checks for the manifest's profile/outputs and build
 * the aggregated result. Checks run sequentially so log output stays readable
 * and probes don't contend; each is independent.
 */
export async function runSmoke(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeResult> {
  const startedAt = runtime.now().toISOString();
  const checks: SmokeCheckResult[] = [];

  for (const check of CHECKS) {
    const result = await check(manifest, runtime);
    const latency =
      result.latencyMs !== undefined ? ` latencyMs=${result.latencyMs}` : '';
    const reason = result.reason !== undefined ? ` reason=${result.reason}` : '';
    runtime.log(
      `[preview:smoke] ${result.status.toUpperCase()} ${result.name}${latency}${reason}`,
    );
    checks.push(result);
  }

  const finishedAt = runtime.now().toISOString();

  return buildSmokeResult({
    stage: manifest.stage,
    profile: manifest.profile,
    startedAt,
    finishedAt,
    accountId: manifest.accountId,
    region: manifest.region,
    checks,
  });
}
