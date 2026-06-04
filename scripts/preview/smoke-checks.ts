/**
 * Individual preview smoke checks.
 *
 * Each check is an async function of `(manifest, runtime)` that returns a single
 * `SmokeCheckResult`. Checks never touch the network or AWS directly: all side
 * effects go through the injected `SmokeRuntime`, which keeps the
 * prerequisite-gating, skip-with-reason, and diagnostics logic unit-testable.
 *
 * Prerequisites that are absent (missing output URL, missing auth token,
 * inapplicable profile) produce an explicit `skipped` result with a reason —
 * never a silent pass.
 */
import type { NormalizedOutputs, PreviewManifest } from './manifest.js';
import type {
  CloudWatchLogCorrelationResult,
  SmokeCheckContext,
  SmokeRuntime,
} from './run-smoke.js';
import type { CheckStatus, SmokeCheckResult } from './smoke-report.js';

export const HEALTH_TIMEOUT_MS = 5_000;
export const THREADS_TIMEOUT_MS = 10_000;
export const CHAT_SSE_TIMEOUT_MS = 60_000;

/**
 * How far back the CloudWatch Logs Insights query window opens relative to now.
 * The chat request happened seconds ago; a generous lookback absorbs clock skew
 * and CloudWatch ingestion delay without widening cost meaningfully.
 */
export const LOG_CORRELATION_LOOKBACK_MS = 10 * 60_000;

const AGENTCORE_PROFILES: ReadonlySet<string> = new Set(['backend-ai', 'full']);
const TEST_AUTH_NOT_CONFIGURED = 'test auth is not configured (set SMOKE_JWT_TOKEN)';
const LOG_CORRELATION_DISABLED =
  'log correlation not enabled (pass --with-log-correlation or set SMOKE_LOG_CORRELATION=true)';
const NO_LOG_GROUPS =
  'no CloudWatch log groups configured (set SMOKE_CLOUDWATCH_LOG_GROUP_NAMES)';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Required when bffApiUrl exists. GET /health, expect 2xx and body.status === 'ok'. */
export async function checkHealth(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeCheckResult> {
  const name = 'bff.health';
  const base = manifest.outputs.bffApiUrl;
  if (!base) {
    return {
      name,
      status: 'skipped',
      reason: 'bffApiUrl not present in manifest outputs',
    };
  }

  const endpoint = joinUrl(base, '/health');
  const probe = await runtime.httpProbe(endpoint, {}, HEALTH_TIMEOUT_MS);

  if (probe.timedOut) {
    return {
      name,
      status: 'failed',
      reason: `timed out after ${HEALTH_TIMEOUT_MS}ms`,
      endpoint,
      timeoutMs: HEALTH_TIMEOUT_MS,
      latencyMs: probe.latencyMs,
    };
  }
  if (probe.error) {
    return {
      name,
      status: 'failed',
      reason: probe.error,
      endpoint,
      timeoutMs: HEALTH_TIMEOUT_MS,
    };
  }
  if (probe.status < 200 || probe.status >= 300) {
    return {
      name,
      status: 'failed',
      reason: `unexpected status ${probe.status}`,
      endpoint,
      latencyMs: probe.latencyMs,
    };
  }

  const body = probe.bodyJson as { status?: unknown } | null;
  if (body?.status !== 'ok') {
    return {
      name,
      status: 'failed',
      reason: `unexpected body.status ${JSON.stringify(body?.status)}`,
      endpoint,
      latencyMs: probe.latencyMs,
    };
  }

  return { name, status: 'passed', endpoint, latencyMs: probe.latencyMs };
}

/** GET /threads with Bearer auth. Skips with reason when no token is configured. */
export async function checkThreads(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeCheckResult> {
  const name = 'bff.threads';
  const base = manifest.outputs.bffApiUrl;
  if (!base) {
    return {
      name,
      status: 'skipped',
      reason: 'bffApiUrl not present in manifest outputs',
    };
  }
  const endpoint = joinUrl(base, '/threads');
  if (!runtime.authToken) {
    return { name, status: 'skipped', reason: TEST_AUTH_NOT_CONFIGURED, endpoint };
  }

  const probe = await runtime.httpProbe(
    endpoint,
    authHeaders(runtime.authToken),
    THREADS_TIMEOUT_MS,
  );

  if (probe.timedOut) {
    return {
      name,
      status: 'failed',
      reason: `timed out after ${THREADS_TIMEOUT_MS}ms`,
      endpoint,
      timeoutMs: THREADS_TIMEOUT_MS,
      latencyMs: probe.latencyMs,
    };
  }
  if (probe.error) {
    return {
      name,
      status: 'failed',
      reason: probe.error,
      endpoint,
      timeoutMs: THREADS_TIMEOUT_MS,
    };
  }
  if (probe.status !== 200) {
    return {
      name,
      status: 'failed',
      reason: `unexpected status ${probe.status}`,
      endpoint,
      latencyMs: probe.latencyMs,
    };
  }

  const body = probe.bodyJson as { threads?: unknown } | null;
  if (!Array.isArray(body?.threads)) {
    return {
      name,
      status: 'failed',
      reason: 'response missing threads array',
      endpoint,
      latencyMs: probe.latencyMs,
    };
  }

  return { name, status: 'passed', endpoint, latencyMs: probe.latencyMs };
}

/** POST /chat SSE. Verifies the stream opens and reaches a terminal `done`. */
export async function checkChatSse(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeCheckResult> {
  const name = 'bff.chatSse';
  const base = manifest.outputs.streamingApiUrl;
  if (!base) {
    return {
      name,
      status: 'skipped',
      reason: 'streamingApiUrl not present in manifest outputs',
    };
  }
  const endpoint = joinUrl(base, '/chat');
  if (!runtime.authToken) {
    return { name, status: 'skipped', reason: TEST_AUTH_NOT_CONFIGURED, endpoint };
  }

  const body: Record<string, unknown> = { message: runtime.prompt };
  if (runtime.threadId) {
    body.threadId = runtime.threadId;
  }
  const headers = {
    ...authHeaders(runtime.authToken),
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  const probe = await runtime.consumeSse(endpoint, body, headers, CHAT_SSE_TIMEOUT_MS);
  const events = [...probe.events];

  if (!probe.opened) {
    return {
      name,
      status: 'failed',
      reason: probe.error ?? 'stream did not open',
      endpoint,
      timeoutMs: CHAT_SSE_TIMEOUT_MS,
      events,
      latencyMs: probe.latencyMs,
    };
  }
  if (probe.timedOut) {
    return {
      name,
      status: 'failed',
      reason: 'timed out before terminal event',
      endpoint,
      timeoutMs: CHAT_SSE_TIMEOUT_MS,
      events,
      latencyMs: probe.latencyMs,
    };
  }
  if (events.length === 0) {
    return {
      name,
      status: 'failed',
      reason: 'no SSE events received',
      endpoint,
      timeoutMs: CHAT_SSE_TIMEOUT_MS,
      events,
      latencyMs: probe.latencyMs,
    };
  }
  if (!probe.gotTerminal) {
    return {
      name,
      status: 'failed',
      reason: 'stream ended without a terminal event',
      endpoint,
      timeoutMs: CHAT_SSE_TIMEOUT_MS,
      events,
      latencyMs: probe.latencyMs,
    };
  }
  if (!probe.terminalIsSuccess) {
    return {
      name,
      status: 'failed',
      reason: 'terminal event was error or cancelled',
      endpoint,
      events,
      latencyMs: probe.latencyMs,
    };
  }
  if (!probe.requestId) {
    return {
      name,
      status: 'failed',
      reason: 'terminal done event did not include a requestId',
      endpoint,
      events,
      latencyMs: probe.latencyMs,
    };
  }

  // traceId/threadId are surfaced when present but not required: some
  // environments may not yet propagate a traceId on the done event.
  const result: SmokeCheckResult = {
    name,
    status: 'passed',
    endpoint,
    events,
    latencyMs: probe.latencyMs,
    requestId: probe.requestId,
  };
  if (probe.traceId) result.traceId = probe.traceId;
  if (probe.threadId) result.threadId = probe.threadId;
  return result;
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  const seen = new Set<string>();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

/**
 * Resolve which CloudWatch log groups the correlation check should search.
 * Prefers an explicit manifest output (`agentCoreLogGroupNames`) when present,
 * otherwise the comma-separated `SMOKE_CLOUDWATCH_LOG_GROUP_NAMES` env value.
 * Returns an empty list when neither is set, so the check skips rather than
 * guessing log group names.
 */
export function resolveLogGroupNames(
  outputs: NormalizedOutputs,
  envValue: string | undefined,
): string[] {
  const fromManifest = parseCommaList(outputs.agentCoreLogGroupNames);
  return fromManifest.length > 0 ? fromManifest : parseCommaList(envValue);
}

/**
 * Decide the correlation check status from a CloudWatch search result.
 *
 * Spec: a requestId is considered correlated when `agent_request_start` AND a
 * terminal log (`agent_request_end` OR `agent_request_error`) are both present
 * for it — an error terminal still proves the requestId propagated end to end,
 * so it counts as a pass, not a failure. Errors and timeouts fail.
 */
export function evaluateLogCorrelation(result: CloudWatchLogCorrelationResult): {
  status: CheckStatus;
  reason?: string;
} {
  if (result.error) {
    return { status: 'failed', reason: result.error };
  }
  if (result.timedOut) {
    return {
      status: 'failed',
      reason: 'timed out before correlating requestId in CloudWatch Logs',
    };
  }
  if (!result.sawRequestStart) {
    return {
      status: 'failed',
      reason: 'agent_request_start not found for requestId in CloudWatch Logs',
    };
  }
  if (!result.sawRequestEnd && !result.sawRequestError) {
    return {
      status: 'failed',
      reason: 'no agent_request_end or agent_request_error found for requestId',
    };
  }
  return { status: 'passed' };
}

function findPreviousResult(
  context: SmokeCheckContext,
  name: string,
): SmokeCheckResult | undefined {
  return context.previousResults.find((result) => result.name === name);
}

/**
 * Opt-in: correlate the `bff.chatSse` requestId with AgentCore Runtime structured
 * logs in CloudWatch. Skips (never silently passes) when correlation is disabled,
 * when `bff.chatSse` did not run, or when no log groups are configured. Fails when
 * `bff.chatSse` ran but produced no requestId, or when the requestId cannot be
 * correlated within the poll budget.
 */
export async function checkChatLogCorrelation(
  _manifest: PreviewManifest,
  runtime: SmokeRuntime,
  context: SmokeCheckContext,
): Promise<SmokeCheckResult> {
  const name = 'bff.chatLogCorrelation';

  if (!runtime.logCorrelationEnabled) {
    return { name, status: 'skipped', reason: LOG_CORRELATION_DISABLED };
  }

  const chat = findPreviousResult(context, 'bff.chatSse');
  if (!chat || chat.status === 'skipped') {
    return {
      name,
      status: 'skipped',
      reason: `bff.chatSse did not run (${chat?.reason ?? 'no result'})`,
    };
  }
  const requestId = chat.requestId;
  if (!requestId) {
    return {
      name,
      status: 'failed',
      reason: 'no requestId captured from bff.chatSse',
    };
  }

  if (runtime.logGroupNames.length === 0) {
    return { name, status: 'skipped', reason: NO_LOG_GROUPS, requestId };
  }

  const correlation = await runtime.searchCloudWatchLogsByRequestId({
    requestId,
    region: runtime.region,
    logGroupNames: runtime.logGroupNames,
    startTimeMs: runtime.now().getTime() - LOG_CORRELATION_LOOKBACK_MS,
    timeoutMs: runtime.logWaitMs,
    pollIntervalMs: runtime.logPollIntervalMs,
  });

  const { status, reason } = evaluateLogCorrelation(correlation);
  const result: SmokeCheckResult = {
    name,
    status,
    requestId,
    latencyMs: correlation.latencyMs,
    matchedLogGroupNames: correlation.matchedLogGroupNames,
    sawRequestStart: correlation.sawRequestStart,
    sawRequestEnd: correlation.sawRequestEnd,
    sawRequestError: correlation.sawRequestError,
  };
  if (reason !== undefined) result.reason = reason;
  if (chat.traceId) result.traceId = chat.traceId;
  return result;
}

/** Optional: invoke the AgentCore runtime on backend-ai / full profiles. */
export async function checkAgentCore(
  manifest: PreviewManifest,
  runtime: SmokeRuntime,
): Promise<SmokeCheckResult> {
  const name = 'agentcore.invoke';
  if (!AGENTCORE_PROFILES.has(manifest.profile)) {
    return {
      name,
      status: 'skipped',
      reason: `not applicable to profile "${manifest.profile}"`,
    };
  }
  const arn = manifest.outputs.agentCoreRuntimeArn;
  if (!arn) {
    return {
      name,
      status: 'skipped',
      reason: 'agentCoreRuntimeArn not present in manifest outputs',
    };
  }

  const timeoutMs = runtime.agentCoreTimeoutMs;
  const probe = await runtime.invokeAgentCore({
    arn,
    qualifier: runtime.agentCoreQualifier,
    region: runtime.region,
    prompt: runtime.prompt,
    timeoutMs,
  });

  if (probe.timedOut) {
    return {
      name,
      status: 'failed',
      reason: `timed out after ${timeoutMs}ms`,
      endpoint: arn,
      timeoutMs,
      latencyMs: probe.latencyMs,
    };
  }
  if (!probe.ok) {
    return {
      name,
      status: 'failed',
      reason: probe.error ?? 'invocation failed',
      endpoint: arn,
      timeoutMs,
      latencyMs: probe.latencyMs,
    };
  }

  return { name, status: 'passed', endpoint: arn, latencyMs: probe.latencyMs };
}
