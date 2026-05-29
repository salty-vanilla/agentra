/**
 * Pure builder for the preview destroy report. No AWS, filesystem, or process
 * access; the status/reason inputs are decided by run-destroy.ts.
 */
import type { AwsIdentity } from './manifest.js';
import type { RejectedStack } from './validate-destroy-target.js';

export type DestroyStatus = 'passed' | 'failed';

export interface DestroyReport {
  stage: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  accountId: string | null;
  region: string | null;
  /** Stacks that passed BOTH name and tag validation (what would/should be destroyed). */
  acceptedStacks: string[];
  /**
   * Stacks successfully handed to `cdk destroy`. We do not post-check that the
   * resources are gone, so this reflects "requested + cdk reported success," not
   * verified deletion. Empty in dry-run and when destroy fails or is skipped.
   */
  requestedDestroyStacks: string[];
  /** Near-misses; presence alone is never a failure. */
  rejectedStacks: RejectedStack[];
  status: DestroyStatus;
  reason?: string;
}

export interface BuildDestroyReportParams {
  stage: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  identity: AwsIdentity | null;
  acceptedStacks: readonly string[];
  requestedDestroyStacks: readonly string[];
  rejectedStacks: readonly RejectedStack[];
  status: DestroyStatus;
  reason: string | undefined;
}

export function buildDestroyReport(params: BuildDestroyReportParams): DestroyReport {
  const report: DestroyReport = {
    stage: params.stage,
    dryRun: params.dryRun,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    accountId: params.identity?.accountId ?? null,
    region: params.identity?.region ?? null,
    acceptedStacks: [...params.acceptedStacks],
    requestedDestroyStacks: [...params.requestedDestroyStacks],
    rejectedStacks: params.rejectedStacks.map((entry) => ({ ...entry })),
    status: params.status,
  };
  if (params.reason !== undefined) {
    report.reason = params.reason;
  }
  return report;
}
