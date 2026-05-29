/**
 * Pure builders and types for the preview smoke result.
 *
 * No AWS, filesystem, or process access. The overall status and per-check
 * statuses are decided by run-smoke.ts / smoke-checks.ts; this module only
 * shapes the machine-readable artifact and aggregates the overall status.
 */

export type CheckStatus = 'passed' | 'failed' | 'skipped';

/** Overall smoke status. `skipped` only when no check was runnable. */
export type SmokeStatus = 'passed' | 'failed' | 'skipped';

export interface SmokeCheckResult {
  /** Stable check id, e.g. `bff.health`, `bff.threads`, `bff.chatSse`, `agentcore.invoke`. */
  name: string;
  status: CheckStatus;
  /** Mandatory on `skipped` and `failed`; explains why (never a silent pass/skip). */
  reason?: string;
  /** Probed URL or runtime ARN, retained for diagnostics. */
  endpoint?: string;
  /** Timeout applied to the check, retained even on timeout failures. */
  timeoutMs?: number;
  /** Observed latency in milliseconds when the check actually ran. */
  latencyMs?: number;
  /** SSE event names received, captured even on partial/failed streams. */
  events?: string[];
}

export interface SmokeSummaryCounts {
  passed: number;
  failed: number;
  skipped: number;
}

export interface SmokeResult {
  project: 'Agentra';
  environmentType: 'preview';
  stage: string;
  profile: string;
  startedAt: string;
  finishedAt: string;
  accountId: string | null;
  region: string | null;
  status: SmokeStatus;
  summary: SmokeSummaryCounts;
  checks: SmokeCheckResult[];
}

export interface BuildSmokeResultParams {
  stage: string;
  profile: string;
  startedAt: string;
  finishedAt: string;
  accountId: string | null;
  region: string | null;
  checks: readonly SmokeCheckResult[];
}

/** Count check statuses for the summary breakdown. */
export function summarizeCounts(checks: readonly SmokeCheckResult[]): SmokeSummaryCounts {
  const summary: SmokeSummaryCounts = { passed: 0, failed: 0, skipped: 0 };
  for (const check of checks) {
    summary[check.status] += 1;
  }
  return summary;
}

/**
 * Aggregate the overall status:
 * - `failed` if any check failed (covers "any required check fails"; a failed
 *   optional check also fails overall so a `passed` result truly means optional
 *   checks passed or skipped).
 * - else `passed` if any check passed.
 * - else `skipped` (every check skipped — no runnable check).
 */
export function aggregateStatus(checks: readonly SmokeCheckResult[]): SmokeStatus {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed';
  }
  if (checks.some((check) => check.status === 'passed')) {
    return 'passed';
  }
  return 'skipped';
}

export function buildSmokeResult(params: BuildSmokeResultParams): SmokeResult {
  const checks = params.checks.map((check) => ({ ...check }));
  return {
    project: 'Agentra',
    environmentType: 'preview',
    stage: params.stage,
    profile: params.profile,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    accountId: params.accountId,
    region: params.region,
    status: aggregateStatus(checks),
    summary: summarizeCounts(checks),
    checks,
  };
}
