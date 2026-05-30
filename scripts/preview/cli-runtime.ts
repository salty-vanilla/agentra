/**
 * Side-effecting orchestration shared by the plan and deploy entry scripts:
 * resolving identity (with allowlist enforcement) and driving the CDK CLI.
 *
 * Kept thin and deliberately not unit-tested; the testable safety logic lives
 * in the pure helpers (cdk-commands.ts, assert-aws-identity.ts, manifest.ts).
 */
import {
  ALLOWED_ACCOUNTS_ENV,
  type AwsIdentity,
  assertAwsIdentity,
  checkAccountAllowlist,
  formatIdentityReport,
  parseAllowedAccounts,
} from './assert-aws-identity.js';
import {
  buildCdkDestroyArgs,
  buildCdkListArgs,
  buildCdkSynthArgs,
  filterPreviewStacks,
} from './cdk-commands.js';
import type { StageFailure } from './cleanup-report.js';
import {
  filterPreviewCandidates,
  parseDescribeStacksOutput,
} from './list-preview-stacks.js';
import { type PreviewConfig, resolvePreviewConfig } from './preview-stage.js';
import type { CleanupDestroyResult } from './run-cleanup.js';
import { runCapture, runInherit } from './run-command.js';
import type { CandidateStack } from './validate-destroy-target.js';

/** Invoke the CDK CLI through the infra-cdk workspace package. */
const CDK_INVOKER = ['--filter', '@agentra/infra-cdk', 'exec', 'cdk'] as const;

/**
 * Enforce the preview account allowlist for the active identity. Warns clearly
 * when no allowlist is configured; throws when a configured allowlist does not
 * include the active account. Shared by deploy/plan and cleanup identity resolvers.
 */
function enforceAccountAllowlist(identity: AwsIdentity): void {
  const allowlist = parseAllowedAccounts(process.env[ALLOWED_ACCOUNTS_ENV]);
  const check = checkAccountAllowlist(identity.accountId, allowlist);
  if (!check.configured) {
    console.warn(
      `WARNING: preview account allowlist is not configured. Set ${ALLOWED_ACCOUNTS_ENV} ` +
        '(comma-separated account IDs) to restrict preview targets.',
    );
    return;
  }
  if (!check.allowed) {
    throw new Error(
      `AWS account ${identity.accountId} is not in the preview allowlist ` +
        `(${check.allowedAccounts.join(', ')}). Aborting.`,
    );
  }
  console.log(`AWS account ${identity.accountId} is in the preview allowlist.`);
}

/**
 * Print the deploy-target identity block, then enforce the account allowlist.
 * Warns clearly when no allowlist is configured; throws when a configured
 * allowlist does not include the active account.
 */
export function resolveAndReportIdentity(config: PreviewConfig): AwsIdentity {
  const identity = assertAwsIdentity();
  console.log(formatIdentityReport(identity, config));
  enforceAccountAllowlist(identity);
  return identity;
}

/**
 * Resolve the active AWS identity for an account-wide cleanup run and enforce the
 * preview account allowlist. Unlike `resolveAndReportIdentity`, cleanup has no
 * single `PreviewConfig` to format, so it logs just the resolved identity.
 */
export function resolveCleanupIdentity(): AwsIdentity {
  const identity = assertAwsIdentity();
  console.log(
    `Cleanup target — account: ${identity.accountId}, region: ${identity.region}, ` +
      `arn: ${identity.arn}`,
  );
  enforceAccountAllowlist(identity);
  return identity;
}

/** Run `cdk synth --quiet` for the preview context; throws on non-zero exit. */
export function synthPreview(config: PreviewConfig): void {
  const status = runInherit('pnpm', [...CDK_INVOKER, ...buildCdkSynthArgs(config)]);
  if (status !== 0) {
    throw new Error(`cdk synth failed (exit ${status}).`);
  }
}

/** Resolve the explicit preview stack names via `cdk list`, namespace-filtered. */
export function listPreviewStacks(config: PreviewConfig): string[] {
  const result = runCapture('pnpm', [...CDK_INVOKER, ...buildCdkListArgs(config)]);
  if (result.status !== 0) {
    throw new Error(`cdk list failed (exit ${result.status}).\n${result.stderr}`);
  }
  const names = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return filterPreviewStacks(names, config.stackPrefix);
}

/** Run an arbitrary CDK command (already-built args) with inherited stdio. */
export function runCdk(cdkArgs: readonly string[]): number {
  return runInherit('pnpm', [...CDK_INVOKER, ...cdkArgs]);
}

/**
 * Read-only: enumerate live CloudFormation stacks (with tags) under the broad
 * `AgentraPreview-` namespace. Used by destroy to validate candidates against
 * both stack name and tags before any destructive action.
 */
export function describePreviewCandidates(): CandidateStack[] {
  const result = runCapture('aws', [
    'cloudformation',
    'describe-stacks',
    '--output',
    'json',
  ]);
  if (result.status !== 0) {
    throw new Error(
      `aws cloudformation describe-stacks failed (exit ${result.status}).\n${result.stderr}`,
    );
  }
  return filterPreviewCandidates(parseDescribeStacksOutput(result.stdout));
}

/**
 * Destroy the explicit, already-validated preview stacks via `cdk destroy
 * --force` (never `--all`). Throws on non-zero exit so the caller records a
 * failed report.
 */
export function destroyPreviewStacks(
  config: PreviewConfig,
  stackNames: readonly string[],
): void {
  const status = runCdk(buildCdkDestroyArgs(config, stackNames));
  if (status !== 0) {
    throw new Error(`cdk destroy failed (exit ${status}).`);
  }
}

/**
 * Destroy the eligible expired stacks for cleanup, grouped by their validated
 * stage, reusing `destroyPreviewStacks`. Each stage is synthesized with the
 * `full` profile because account-wide cleanup cannot know the original deploy
 * profile of every stage; this ASSUMES a full synth contains every preview
 * profile's stack names (deterministic `AgentraPreview-<stage>-<Suffix>`), so
 * `cdk destroy` can resolve the explicit validated names. A failure for one stage
 * is recorded and does not stop the remaining stages.
 */
export function cleanupDestroyByStage(
  groups: ReadonlyMap<string, string[]>,
): CleanupDestroyResult {
  const deleteRequested: string[] = [];
  const deleteFailures: StageFailure[] = [];

  for (const [stage, stackNames] of groups) {
    const config = resolvePreviewConfig({ stage, profile: 'full' });
    try {
      destroyPreviewStacks(config, stackNames);
      deleteRequested.push(...stackNames);
    } catch (error) {
      deleteFailures.push({
        stage,
        reason: `cdk destroy failed for stage "${stage}": ${(error as Error).message}`,
      });
    }
  }

  return { deleteRequested, deleteFailures };
}
