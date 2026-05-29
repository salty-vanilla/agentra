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
import type { PreviewManifest } from './manifest.js';
import type { SmokeRuntime } from './run-smoke.js';
import type { SmokeCheckResult } from './smoke-report.js';

export const HEALTH_TIMEOUT_MS = 5_000;
export const THREADS_TIMEOUT_MS = 10_000;
export const CHAT_SSE_TIMEOUT_MS = 60_000;

const AGENTCORE_PROFILES: ReadonlySet<string> = new Set(['backend-ai', 'full']);
const TEST_AUTH_NOT_CONFIGURED = 'test auth is not configured (set SMOKE_JWT_TOKEN)';

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

  return { name, status: 'passed', endpoint, events, latencyMs: probe.latencyMs };
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
