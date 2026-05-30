/**
 * Testable orchestrator for `pnpm preview:cleanup`.
 *
 * All side effects (AWS identity, CloudFormation describe, CDK destroy, report
 * writing, logging, clock) are injected via `CleanupRuntime` so the safety
 * properties — confirmation gating, "dry-run never destroys", "execute only
 * destroys eligible expired stacks", "empty-eligible execute is a clean no-op" —
 * are unit-testable without touching AWS.
 *
 * Ordering is deliberate: the stage filter is validated and confirmation is
 * asserted BEFORE any runtime side effect, so a bad `--stage` or a missing/
 * mismatched `--confirm` can never trigger identity, describe, or destroy.
 */
import type { RawCleanupArgs } from './cleanup-args.js';
import {
  type CleanupClassification,
  classifyStacks,
  type ExpiringStack,
} from './cleanup-classify.js';
import {
  buildCleanupReport,
  type CleanupReport,
  type CleanupStatus,
  type StageFailure,
} from './cleanup-report.js';
import type { AwsIdentity } from './manifest.js';
import { cleanupDryRunPath, cleanupResultPath } from './paths.js';
import { validatePreviewStage } from './preview-stage.js';
import {
  assertCleanupConfirmation,
  type CandidateStack,
} from './validate-destroy-target.js';

/** Outcome of handing eligible stacks to the destroy executor, grouped by stage. */
export interface CleanupDestroyResult {
  /** Stacks handed to `cdk destroy` that reported success (not verified deleted). */
  deleteRequested: string[];
  /** Stages whose destroy failed, with the error reason. */
  deleteFailures: StageFailure[];
}

export interface CleanupRuntime {
  resolveIdentity: () => AwsIdentity;
  describeCandidates: () => CandidateStack[];
  /** Destroy the eligible expired stacks, grouped by their (validated) stage. */
  executeDestroyByStage: (groups: ReadonlyMap<string, string[]>) => CleanupDestroyResult;
  writeReport: (filePath: string, report: CleanupReport) => void;
  log: (message: string) => void;
  now: () => Date;
}

/** Build a `stage -> stackNames` map from eligible stacks for grouped destroy. */
function groupByStage(stacks: readonly ExpiringStack[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const stack of stacks) {
    const existing = groups.get(stack.stage);
    if (existing) {
      existing.push(stack.stackName);
    } else {
      groups.set(stack.stage, [stack.stackName]);
    }
  }
  return groups;
}

function logClassification(
  classification: CleanupClassification,
  runtime: CleanupRuntime,
): void {
  runtime.log(
    `Classified preview stacks — eligibleExpired: ${classification.eligibleExpired.length}, ` +
      `activeNotExpired: ${classification.activeNotExpired.length}, ` +
      `rejectedUnsafe: ${classification.rejectedUnsafe.length}, ` +
      `missingTags: ${classification.missingTags.length}.`,
  );
  for (const entry of classification.rejectedUnsafe) {
    runtime.log(`  rejectedUnsafe: ${entry.stackName} — ${entry.reason}`);
  }
  for (const entry of classification.missingTags) {
    runtime.log(`  missingTags: ${entry.stackName} — ${entry.reason}`);
  }
}

/**
 * Discover and classify preview stacks, then (for `--execute`) destroy only the
 * eligible expired stacks grouped by stage. Always builds and writes a report and
 * returns it. An execute run with zero eligible stacks is a clean no-op
 * (`status='passed'`); a partial destroy failure yields `status='failed'` with the
 * failed stages recorded under `deleteFailures`.
 */
export function runCleanup(args: RawCleanupArgs, runtime: CleanupRuntime): CleanupReport {
  const stageFilter = args.stage ?? null;
  if (stageFilter !== null) {
    validatePreviewStage(stageFilter);
  }

  // Guard first: no AWS side effect may precede a valid confirmation.
  assertCleanupConfirmation({ mode: args.mode, stageFilter, confirm: args.confirm });

  const identity = runtime.resolveIdentity();
  const evaluatedAt = runtime.now();
  const startedAt = evaluatedAt.toISOString();

  const candidates = runtime.describeCandidates();
  const classification = classifyStacks(
    candidates,
    evaluatedAt,
    stageFilter ?? undefined,
  );
  logClassification(classification, runtime);

  let status: CleanupStatus = 'passed';
  let reason: string | undefined;
  let deleteRequested: string[] | undefined;
  let deleteFailures: StageFailure[] | undefined;

  if (args.mode === 'execute') {
    const eligible = classification.eligibleExpired;
    if (eligible.length === 0) {
      const scope = stageFilter ? ` for stage "${stageFilter}"` : '';
      reason = `No expired preview stacks to clean up${scope}.`;
      runtime.log(reason);
      deleteRequested = [];
      deleteFailures = [];
    } else {
      const groups = groupByStage(eligible);
      runtime.log(
        `Cleaning up ${eligible.length} expired stack(s) across ${groups.size} stage(s):`,
      );
      for (const entry of eligible) {
        runtime.log(
          `  ${entry.stackName} (stage ${entry.stage}, expired ${entry.expiresAt})`,
        );
      }
      const result = runtime.executeDestroyByStage(groups);
      deleteRequested = result.deleteRequested;
      deleteFailures = result.deleteFailures;
      if (deleteFailures.length > 0) {
        status = 'failed';
        reason = `Cleanup destroy failed for ${deleteFailures.length} stage(s).`;
        runtime.log(reason);
      }
    }
  }

  const finishedAt = runtime.now().toISOString();
  const timestamp = startedAt.replace(/[:.]/g, '-');

  const report = buildCleanupReport({
    mode: args.mode,
    stageFilter,
    startedAt,
    finishedAt,
    identity,
    classification,
    deleteRequested,
    deleteFailures,
    status,
    reason,
  });

  const reportPath =
    args.mode === 'dry-run' ? cleanupDryRunPath(timestamp) : cleanupResultPath(timestamp);
  runtime.writeReport(reportPath, report);
  runtime.log(`Wrote cleanup report: ${reportPath}`);

  return report;
}
