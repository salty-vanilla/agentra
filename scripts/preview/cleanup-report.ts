/**
 * Pure builder for the preview cleanup report. No AWS, filesystem, or process
 * access; the status/reason and execute results are decided by run-cleanup.ts.
 */
import type { CleanupClassification, ExpiringStack } from './cleanup-classify.js';
import type { AwsIdentity } from './manifest.js';
import type { RejectedStack } from './validate-destroy-target.js';

export type CleanupMode = 'dry-run' | 'execute';
export type CleanupStatus = 'passed' | 'failed';

/** A preview stage whose grouped `cdk destroy` failed, with the error reason. */
export interface StageFailure {
  stage: string;
  reason: string;
}

export interface CleanupSummary {
  eligibleExpired: number;
  activeNotExpired: number;
  rejectedUnsafe: number;
  missingTags: number;
}

export interface CleanupReport {
  startedAt: string;
  finishedAt: string;
  accountId: string | null;
  region: string | null;
  mode: CleanupMode;
  /** The `--stage` filter that scoped this run, or `null` for account-wide. */
  stageFilter: string | null;
  summary: CleanupSummary;
  eligibleExpired: ExpiringStack[];
  activeNotExpired: ExpiringStack[];
  rejectedUnsafe: RejectedStack[];
  missingTags: RejectedStack[];
  /**
   * Execute-only. Stacks handed to `cdk destroy` that reported success. We do not
   * post-check that the resources are gone, so this is "requested + cdk reported
   * success," not verified deletion — hence not named `deleted`.
   */
  deleteRequested?: string[];
  /** Execute-only. Stages whose `cdk destroy` failed, with the error reason. */
  deleteFailures?: StageFailure[];
  status: CleanupStatus;
  reason?: string;
}

export interface BuildCleanupReportParams {
  mode: CleanupMode;
  stageFilter: string | null;
  startedAt: string;
  finishedAt: string;
  identity: AwsIdentity | null;
  classification: CleanupClassification;
  deleteRequested?: readonly string[] | undefined;
  deleteFailures?: readonly StageFailure[] | undefined;
  status: CleanupStatus;
  reason: string | undefined;
}

function summarize(classification: CleanupClassification): CleanupSummary {
  return {
    eligibleExpired: classification.eligibleExpired.length,
    activeNotExpired: classification.activeNotExpired.length,
    rejectedUnsafe: classification.rejectedUnsafe.length,
    missingTags: classification.missingTags.length,
  };
}

export function buildCleanupReport(params: BuildCleanupReportParams): CleanupReport {
  const { classification } = params;

  const report: CleanupReport = {
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    accountId: params.identity?.accountId ?? null,
    region: params.identity?.region ?? null,
    mode: params.mode,
    stageFilter: params.stageFilter,
    summary: summarize(classification),
    eligibleExpired: classification.eligibleExpired.map((entry) => ({ ...entry })),
    activeNotExpired: classification.activeNotExpired.map((entry) => ({ ...entry })),
    rejectedUnsafe: classification.rejectedUnsafe.map((entry) => ({ ...entry })),
    missingTags: classification.missingTags.map((entry) => ({ ...entry })),
    status: params.status,
  };

  if (params.deleteRequested !== undefined) {
    report.deleteRequested = [...params.deleteRequested];
  }
  if (params.deleteFailures !== undefined) {
    report.deleteFailures = params.deleteFailures.map((entry) => ({ ...entry }));
  }
  if (params.reason !== undefined) {
    report.reason = params.reason;
  }

  return report;
}
