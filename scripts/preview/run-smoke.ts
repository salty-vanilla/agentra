/**
 * Testable orchestrator for `pnpm preview:smoke`.
 *
 * All side effects (HTTP, SSE consumption, AgentCore invocation, clock, logging)
 * are injected via `SmokeRuntime` so the check selection and result aggregation
 * are unit-testable without live AWS or network. The real runtime is assembled
 * in smoke.ts; this module owns the pure orchestration.
 */
import type { PreviewManifest } from './manifest.js';
import type { SmokeMode } from './smoke-args.js';
import {
  checkAgentCore,
  checkChatLogCorrelation,
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
  /** Correlation id from the terminal `done` payload (never raw response text). */
  requestId?: string;
  /** Trace id from `done.traceId` or `done.observabilitySummary.traceId`. */
  traceId?: string;
  /** Thread id from the terminal `done` payload. */
  threadId?: string;
}

/** Parameters for a CloudWatch Logs requestId correlation search. */
export interface CloudWatchLogCorrelationParams {
  requestId: string;
  region: string | null;
  logGroupNames: string[];
  /** Lower bound of the Logs Insights query window (epoch ms). */
  startTimeMs: number;
  /** Total poll budget before giving up (ms). */
  timeoutMs: number;
  /** Delay between successive Logs Insights queries (ms). */
  pollIntervalMs: number;
}

/**
 * Outcome of correlating a `requestId` against AgentCore Runtime structured logs
 * in CloudWatch. Carries only structured booleans and matched log-group names —
 * never raw log message text.
 */
export interface CloudWatchLogCorrelationResult {
  ok: boolean;
  matchedLogGroupNames: string[];
  sawRequestStart: boolean;
  sawRequestEnd: boolean;
  sawRequestError: boolean;
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
  searchCloudWatchLogsByRequestId: (
    params: CloudWatchLogCorrelationParams,
  ) => Promise<CloudWatchLogCorrelationResult>;
  authToken: string | undefined;
  region: string | null;
  prompt: string;
  threadId: string | undefined;
  agentCoreQualifier: string | undefined;
  agentCoreTimeoutMs: number;
  /** Smoke depth: `core` runs only the cheap GET checks; `full` adds the heavy ones. */
  mode: SmokeMode;
  /** Whether the opt-in `bff.chatLogCorrelation` check should run. */
  logCorrelationEnabled: boolean;
  /** CloudWatch Logs groups to search for the requestId (empty = skip). */
  logGroupNames: string[];
  /** Total poll budget for log correlation (ms). */
  logWaitMs: number;
  /** Delay between CloudWatch Logs polls (ms). */
  logPollIntervalMs: number;
  now: () => Date;
  log: (message: string) => void;
}

/**
 * Context handed to each check so later checks can read earlier results — used
 * by `bff.chatLogCorrelation` to recover the `requestId` captured by
 * `bff.chatSse`. `previousResults` holds the results of all checks already run,
 * in order.
 */
export interface SmokeCheckContext {
  previousResults: readonly SmokeCheckResult[];
}

/** A single smoke check: reads the manifest, runtime, and prior results. */
export type SmokeCheck = (
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
  context: SmokeCheckContext,
) => Promise<SmokeCheckResult>;

/** Filesystem dependencies for loading the manifest, injectable for tests. */
export interface ManifestFsDeps {
  exists: (path: string) => boolean;
  readJson: <T>(path: string) => T;
}

/**
 * Load and validate the preview manifest. Throws a clear error when the manifest
 * is missing, structurally unusable (no stage / no outputs), or its `stage` does
 * not match the requested `expectedStage`. The stage match guards against an
 * explicit `--manifest` from one stage being smoke-tested as another, which would
 * otherwise probe one environment's endpoints and write the result under a
 * different stage's artifact dir.
 */
export function loadSmokeManifest(
  manifestPath: string,
  expectedStage: string,
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
  if (manifest.stage !== expectedStage) {
    throw new Error(
      `Manifest stage mismatch: --stage=${expectedStage}, ` +
        `manifest.stage=${manifest.stage} (${manifestPath}).`,
    );
  }
  if (manifest.outputs === null || typeof manifest.outputs !== 'object') {
    throw new Error(`Manifest at ${manifestPath} is missing an "outputs" object.`);
  }
  return manifest;
}

/** Depth tier of a check: `core` always runs; `full` is heavy and opt-in. */
type CheckTier = 'core' | 'full';

interface RegisteredCheck {
  /** Stable check id, also used to emit a skip result without running it. */
  name: string;
  tier: CheckTier;
  run: SmokeCheck;
}

// Order matters: `bff.chatLogCorrelation` reads the `requestId` produced by
// `bff.chatSse`, so it must run after it. `core` checks are cheap GETs; `full`
// checks invoke models / query CloudWatch and only run under `--mode full`.
const CHECKS: ReadonlyArray<RegisteredCheck> = [
  { name: 'bff.health', tier: 'core', run: checkHealth },
  { name: 'bff.threads', tier: 'core', run: checkThreads },
  { name: 'bff.chatSse', tier: 'full', run: checkChatSse },
  { name: 'bff.chatLogCorrelation', tier: 'full', run: checkChatLogCorrelation },
  { name: 'agentcore.invoke', tier: 'full', run: checkAgentCore },
];

const FULL_MODE_REQUIRED = 'skipped in --mode core (use --mode full)';

/**
 * Run all applicable smoke checks for the manifest's profile/outputs and build
 * the aggregated result. Checks run sequentially so log output stays readable
 * and probes don't contend, and so each check can see the results of those
 * before it via `previousResults`.
 *
 * `full`-tier checks (chat SSE, AgentCore invoke, log correlation) only run under
 * `--mode full`; in `core` mode they are recorded as `skipped` with a reason
 * (never silently dropped) and their side-effecting probes are not invoked.
 */
export async function runSmoke(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeResult> {
  const startedAt = runtime.now().toISOString();
  const checks: SmokeCheckResult[] = [];

  for (const { name, tier, run } of CHECKS) {
    const result =
      tier === 'full' && runtime.mode !== 'full'
        ? { name, status: 'skipped' as const, reason: FULL_MODE_REQUIRED }
        : await run(manifest, runtime, { previousResults: checks });
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
