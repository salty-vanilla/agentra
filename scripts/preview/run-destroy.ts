/**
 * Testable orchestrator for `pnpm preview:destroy`.
 *
 * All side effects (AWS identity, CloudFormation describe, CDK destroy, report
 * writing, logging, clock) are injected via `DestroyRuntime` so the safety
 * properties — confirmation gating, "dry-run never destroys", "no destroyable
 * stacks is a failed real destroy" — are unit-testable without touching AWS.
 *
 * Ordering is deliberate: confirmation is asserted BEFORE any runtime side effect
 * so a bad/missing `--confirm` can never trigger identity, describe, or destroy.
 */

import type { RawDestroyArgs } from './destroy-args.js';
import {
  buildDestroyReport,
  type DestroyReport,
  type DestroyStatus,
} from './destroy-report.js';
import type { AwsIdentity } from './manifest.js';
import { destroyDryRunPath, destroyResultPath } from './paths.js';
import type { PreviewConfig } from './preview-stage.js';
import { resolvePreviewConfig } from './preview-stage.js';
import type { CandidateStack } from './validate-destroy-target.js';
import { assertDestroyConfirmation, partitionStacks } from './validate-destroy-target.js';

export interface DestroyRuntime {
  resolveIdentity: (config: PreviewConfig) => AwsIdentity;
  describeCandidates: (config: PreviewConfig) => CandidateStack[];
  /** Destroy the explicit validated stacks; throws on failure. */
  executeDestroy: (config: PreviewConfig, stackNames: readonly string[]) => void;
  writeReport: (filePath: string, report: DestroyReport) => void;
  log: (message: string) => void;
  now: () => Date;
}

function noDestroyableReason(stage: string): string {
  return `No destroyable stacks found for stage "${stage}".`;
}

/**
 * Validate, then (for a real destroy with accepted targets) destroy the explicit
 * preview stacks for the stage. Once validation and discovery succeed, builds and
 * writes a report and returns it — including a best-effort failed report when
 * `cdk destroy` fails. Failures in confirmation, identity resolution, or candidate
 * discovery throw before any report is written.
 */
export function runDestroy(args: RawDestroyArgs, runtime: DestroyRuntime): DestroyReport {
  const config = resolvePreviewConfig(args);

  // Guard first: no AWS side effect may precede a valid confirmation.
  assertDestroyConfirmation({
    confirm: args.confirm,
    stage: config.stage,
    dryRun: args.dryRun,
  });

  const identity = runtime.resolveIdentity(config);
  const startedAt = runtime.now().toISOString();

  const candidates = runtime.describeCandidates(config);
  const { accepted, rejected } = partitionStacks(candidates, config.stage);

  for (const entry of rejected) {
    runtime.log(`  rejected: ${entry.stackName} — ${entry.reason}`);
  }

  let status: DestroyStatus;
  let reason: string | undefined;
  let requestedDestroyStacks: string[] = [];

  if (args.dryRun) {
    status = 'passed';
    if (accepted.length === 0) {
      reason = noDestroyableReason(config.stage);
      runtime.log(reason);
    } else {
      runtime.log(`Dry-run: ${accepted.length} stack(s) would be destroyed:`);
      for (const name of accepted) {
        runtime.log(`  ${name}`);
      }
    }
  } else if (accepted.length === 0) {
    status = 'failed';
    reason = noDestroyableReason(config.stage);
    runtime.log(reason);
  } else {
    runtime.log(`Destroying ${accepted.length} preview stack(s):`);
    for (const name of accepted) {
      runtime.log(`  ${name}`);
    }
    try {
      runtime.executeDestroy(config, accepted);
      status = 'passed';
      requestedDestroyStacks = [...accepted];
    } catch (error) {
      status = 'failed';
      reason = `cdk destroy failed: ${(error as Error).message}`;
      runtime.log(reason);
    }
  }

  const finishedAt = runtime.now().toISOString();

  const report = buildDestroyReport({
    stage: config.stage,
    dryRun: args.dryRun,
    startedAt,
    finishedAt,
    identity,
    acceptedStacks: accepted,
    requestedDestroyStacks,
    rejectedStacks: rejected,
    status,
    reason,
  });

  const reportPath = args.dryRun
    ? destroyDryRunPath(config.stage)
    : destroyResultPath(config.stage);
  runtime.writeReport(reportPath, report);
  runtime.log(`Wrote destroy report: ${reportPath}`);

  return report;
}
