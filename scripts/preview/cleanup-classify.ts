/**
 * Pure classification core for `pnpm preview:cleanup`. No AWS, filesystem, or
 * process access.
 *
 * Cleanup is account-wide: unlike destroy (which targets one fixed `--stage`),
 * each candidate is validated against ITS OWN `Stage` tag. A stack is only ever
 * eligible for deletion when it passes the same two-layer name+tag guard as
 * destroy (#317, `validateDestroyTarget`) AND its `ExpiresAt` tag is in the past.
 *
 * The `Stage` tag is never trusted before validation: it is checked with
 * `isPreviewStage` so a forbidden/malformed stage tag (e.g. `prod`) can never be
 * used as a destroy namespace.
 */
import { isPreviewStage } from './preview-stage.js';
import type { CandidateStack, RejectedStack } from './validate-destroy-target.js';
import { validateDestroyTarget } from './validate-destroy-target.js';

/** A classified preview stack with its resolved stage and expiry timestamp. */
export interface ExpiringStack {
  stage: string;
  stackName: string;
  expiresAt: string;
}

export interface CleanupClassification {
  /** Passed all safety checks AND `ExpiresAt` is in the past — deletable. */
  eligibleExpired: ExpiringStack[];
  /** Passed all safety checks but `ExpiresAt` is still in the future. */
  activeNotExpired: ExpiringStack[];
  /** Tags present but a safety check failed (bad value, name/tag mismatch, malformed). */
  rejectedUnsafe: RejectedStack[];
  /** Missing a required identifying tag, so the stack cannot be safely classified. */
  missingTags: RejectedStack[];
}

/**
 * Strict ISO 8601 parse. Returns epoch milliseconds, or `null` when the value is
 * not a well-formed, in-range ISO 8601 timestamp with an explicit timezone.
 *
 * `Date.parse` alone is unsafe here: it silently normalizes impossible dates and
 * times (e.g. `2026-02-30T00:00:00Z` rolls into March, `...T24:00:00Z` into the
 * next day). Because `ExpiresAt` is the basis for deletion eligibility, the
 * captured fields are range-checked explicitly (month/day with leap years,
 * hour/minute/second, timezone offset) before trusting `Date.parse`.
 */
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Number of days in a given 1-based month, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseExpiresAt(value: string): number | null {
  const match = ISO_8601.exec(value);
  if (!match) {
    return null;
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, tz] = match;
  if (tz === undefined) {
    return null;
  }
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (tz !== 'Z') {
    const offsetHours = Number(tz.slice(1, 3));
    const offsetMinutes = Number(tz.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      return null;
    }
  }

  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Whether a tag value is present and not whitespace-only. */
function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * Whether a candidate is in scope for a `--stage` filter. Includes near-misses so
 * that a name/tag mismatch (name says `<stage>` but the `Stage` tag differs, or
 * vice versa) is reported as `rejectedUnsafe` rather than silently dropped.
 */
function inStageScope(candidate: CandidateStack, stage: string): boolean {
  const namespace = `AgentraPreview-${stage}-`;
  return candidate.tags.Stage === stage || candidate.stackName.startsWith(namespace);
}

function classifyOne(
  candidate: CandidateStack,
  nowMs: number,
  result: CleanupClassification,
): void {
  const { stackName, tags } = candidate;

  // All identifying tags must be present before the stack can be classified.
  if (!isPresent(tags.Project)) {
    result.missingTags.push({ stackName, reason: 'missing Project tag' });
    return;
  }
  if (!isPresent(tags.EnvironmentType)) {
    result.missingTags.push({ stackName, reason: 'missing EnvironmentType tag' });
    return;
  }
  const stage = tags.Stage;
  if (!isPresent(stage)) {
    result.missingTags.push({ stackName, reason: 'missing Stage tag' });
    return;
  }
  const expiresAtTag = tags.ExpiresAt;
  if (!isPresent(expiresAtTag)) {
    result.missingTags.push({ stackName, reason: 'missing ExpiresAt tag' });
    return;
  }

  // Never trust the Stage tag before validating it.
  if (!isPreviewStage(stage)) {
    result.rejectedUnsafe.push({
      stackName,
      reason: `Stage tag "${stage}" is not a valid preview stage`,
    });
    return;
  }

  // Reuse the #317 two-layer name+tag guard, keyed on the stack's own Stage tag.
  const decision = validateDestroyTarget(candidate, stage);
  if (!decision.destroyable) {
    result.rejectedUnsafe.push({ stackName, reason: decision.reason ?? 'rejected' });
    return;
  }

  const expiresMs = parseExpiresAt(expiresAtTag);
  if (expiresMs === null) {
    result.rejectedUnsafe.push({
      stackName,
      reason: `malformed ExpiresAt tag "${expiresAtTag}"`,
    });
    return;
  }

  const entry: ExpiringStack = { stage, stackName, expiresAt: expiresAtTag };
  if (expiresMs < nowMs) {
    result.eligibleExpired.push(entry);
  } else {
    result.activeNotExpired.push(entry);
  }
}

/**
 * Classify preview stack candidates into the four cleanup buckets. When
 * `stageFilter` is provided, only candidates in scope for that stage (by tag or
 * name) are considered; all others are ignored. Returns new arrays; never mutates
 * the input.
 */
export function classifyStacks(
  candidates: readonly CandidateStack[],
  now: Date,
  stageFilter?: string,
): CleanupClassification {
  const result: CleanupClassification = {
    eligibleExpired: [],
    activeNotExpired: [],
    rejectedUnsafe: [],
    missingTags: [],
  };
  const nowMs = now.getTime();

  for (const candidate of candidates) {
    if (stageFilter !== undefined && !inStageScope(candidate, stageFilter)) {
      continue;
    }
    classifyOne(candidate, nowMs, result);
  }

  return result;
}
