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
import {
  filterPreviewCandidates,
  parseDescribeStacksOutput,
} from './list-preview-stacks.js';
import type { PreviewConfig } from './preview-stage.js';
import { runCapture, runInherit } from './run-command.js';
import type { CandidateStack } from './validate-destroy-target.js';

/** Invoke the CDK CLI through the infra-cdk workspace package. */
const CDK_INVOKER = ['--filter', '@agentra/infra-cdk', 'exec', 'cdk'] as const;

/**
 * Print the deploy-target identity block, then enforce the account allowlist.
 * Warns clearly when no allowlist is configured; throws when a configured
 * allowlist does not include the active account.
 */
export function resolveAndReportIdentity(config: PreviewConfig): AwsIdentity {
  const identity = assertAwsIdentity();
  console.log(formatIdentityReport(identity, config));

  const allowlist = parseAllowedAccounts(process.env[ALLOWED_ACCOUNTS_ENV]);
  const check = checkAccountAllowlist(identity.accountId, allowlist);
  if (!check.configured) {
    console.warn(
      `WARNING: preview account allowlist is not configured. Set ${ALLOWED_ACCOUNTS_ENV} ` +
        '(comma-separated account IDs) to restrict preview deploy targets.',
    );
    return identity;
  }
  if (!check.allowed) {
    throw new Error(
      `AWS account ${identity.accountId} is not in the preview allowlist ` +
        `(${check.allowedAccounts.join(', ')}). Aborting.`,
    );
  }
  console.log(`AWS account ${identity.accountId} is in the preview allowlist.`);
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
export function describePreviewCandidates(_config: PreviewConfig): CandidateStack[] {
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
