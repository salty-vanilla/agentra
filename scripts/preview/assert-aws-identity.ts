/**
 * AWS identity assertion for preview commands.
 *
 * Pure helpers (region resolution, allowlist parsing/checking, report
 * formatting) are separated from the side-effecting `assertAwsIdentity`, which
 * shells out to `aws sts get-caller-identity`. The optional account allowlist
 * is read from `AGENTRA_PREVIEW_ALLOWED_ACCOUNTS` (comma-separated).
 */

import type { AwsIdentity } from './manifest.js';
import type { PreviewConfig } from './preview-stage.js';
import { runCapture } from './run-command.js';

export type { AwsIdentity } from './manifest.js';

/** Env var holding the comma-separated list of allowed preview account IDs. */
export const ALLOWED_ACCOUNTS_ENV = 'AGENTRA_PREVIEW_ALLOWED_ACCOUNTS';

export function resolveRegion(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim() || undefined;
}

export function parseAllowedAccounts(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface AllowlistCheck {
  configured: boolean;
  allowed: boolean;
  allowedAccounts: string[];
}

/**
 * Evaluate an account against the allowlist.
 *
 * An empty allowlist is treated as "not configured" (allowed, with a warning
 * surfaced by the caller). A configured allowlist must contain the account.
 */
export function checkAccountAllowlist(
  accountId: string,
  allowlist: readonly string[],
): AllowlistCheck {
  if (allowlist.length === 0) {
    return { configured: false, allowed: true, allowedAccounts: [] };
  }
  return {
    configured: true,
    allowed: allowlist.includes(accountId),
    allowedAccounts: [...allowlist],
  };
}

export function formatIdentityReport(
  identity: AwsIdentity,
  config: PreviewConfig,
): string {
  return [
    'Preview deploy target:',
    `  account: ${identity.accountId}`,
    `  region: ${identity.region}`,
    `  arn: ${identity.arn}`,
    `  stage: ${config.stage}`,
    `  profile: ${config.profile}`,
    `  ttlHours: ${config.ttlHours}`,
    `  expiresAt: ${config.expiresAt}`,
  ].join('\n');
}

/**
 * Resolve the active AWS caller identity, failing fast when region is unset or
 * `aws sts get-caller-identity` does not return an account/ARN.
 */
export function assertAwsIdentity(env: NodeJS.ProcessEnv = process.env): AwsIdentity {
  const region = resolveRegion(env);
  if (!region) {
    throw new Error(
      'AWS region is not set. Export AWS_REGION or AWS_DEFAULT_REGION before running preview commands.',
    );
  }

  const result = runCapture('aws', ['sts', 'get-caller-identity', '--output', 'json'], {
    env,
  });
  if (result.status !== 0) {
    throw new Error(
      `Failed to resolve AWS identity (aws sts get-caller-identity exited ${result.status}).\n${result.stderr}`,
    );
  }

  let parsed: { Account?: string; Arn?: string };
  try {
    parsed = JSON.parse(result.stdout) as { Account?: string; Arn?: string };
  } catch {
    throw new Error(
      `Could not parse aws sts get-caller-identity output:\n${result.stdout}`,
    );
  }
  if (!parsed.Account || !parsed.Arn) {
    throw new Error('aws sts get-caller-identity did not return an Account and Arn.');
  }

  return { accountId: parsed.Account, region, arn: parsed.Arn };
}
