/**
 * Safety core for preview destroy. Pure: no AWS, filesystem, or process access.
 *
 * A stack is destroyable ONLY when BOTH layers pass: the CloudFormation stack
 * name is under the `AgentraPreview-<stage>-` namespace AND the live stack tags
 * identify it as an Agentra preview stack for the requested stage. Tags alone are
 * never sufficient, and the name check alone is never sufficient.
 */

/** A live CloudFormation stack reduced to the fields the destroy guard needs. */
export interface CandidateStack {
  stackName: string;
  tags: Readonly<Record<string, string>>;
}

/** A stack that was refused, with a human-readable reason. */
export interface RejectedStack {
  stackName: string;
  reason: string;
}

export interface DestroyDecision {
  destroyable: boolean;
  reason?: string;
}

const REQUIRED_TAGS = {
  Project: 'Agentra',
  EnvironmentType: 'preview',
} as const;

/**
 * Decide whether a single stack is a valid destroy target for `stage`.
 *
 * Checks are first-failure-wins so the rejection reason names the first missing
 * guard. The `AgentraPreview-<stage>-` prefix requires the trailing hyphen so a
 * request for stage `pr-123` never matches `AgentraPreview-pr-1234-*`.
 */
export function validateDestroyTarget(
  stack: CandidateStack,
  stage: string,
): DestroyDecision {
  const { stackName, tags } = stack;

  if (!stackName.startsWith('AgentraPreview-')) {
    return {
      destroyable: false,
      reason: 'stack name does not start with AgentraPreview-',
    };
  }

  const stageNamespace = `AgentraPreview-${stage}-`;
  if (!stackName.startsWith(stageNamespace)) {
    return {
      destroyable: false,
      reason: `stack name does not start with ${stageNamespace}`,
    };
  }

  if (tags.Project !== REQUIRED_TAGS.Project) {
    return {
      destroyable: false,
      reason: `tag Project must equal "${REQUIRED_TAGS.Project}"`,
    };
  }

  if (tags.EnvironmentType !== REQUIRED_TAGS.EnvironmentType) {
    return {
      destroyable: false,
      reason: `tag EnvironmentType must equal "${REQUIRED_TAGS.EnvironmentType}"`,
    };
  }

  if (tags.Stage !== stage) {
    return {
      destroyable: false,
      reason: `tag Stage "${tags.Stage ?? ''}" does not match requested stage "${stage}"`,
    };
  }

  if (!tags.ExpiresAt || tags.ExpiresAt.trim().length === 0) {
    return { destroyable: false, reason: 'missing required ExpiresAt tag' };
  }

  return { destroyable: true };
}

/**
 * Split candidate stacks into accepted destroy targets and rejected stacks.
 * Returns new arrays; never mutates the input.
 */
export function partitionStacks(
  candidates: readonly CandidateStack[],
  stage: string,
): { accepted: string[]; rejected: RejectedStack[] } {
  const accepted: string[] = [];
  const rejected: RejectedStack[] = [];

  for (const candidate of candidates) {
    const decision = validateDestroyTarget(candidate, stage);
    if (decision.destroyable) {
      accepted.push(candidate.stackName);
    } else {
      rejected.push({
        stackName: candidate.stackName,
        reason: decision.reason ?? 'rejected',
      });
    }
  }

  return { accepted, rejected };
}

/**
 * Enforce the local confirmation policy. For a real destroy, `confirm` must be
 * present and exactly equal `stage`; because stages are regex-validated and
 * contain no whitespace, strict equality also rejects empty `--confirm=` and
 * whitespace-padded values. Dry-run requires no confirmation.
 */
export function assertDestroyConfirmation(params: {
  confirm: string | undefined;
  stage: string;
  dryRun: boolean;
}): void {
  if (params.dryRun) {
    return;
  }
  if (params.confirm === undefined) {
    throw new Error(
      `Refusing to destroy without confirmation. Re-run with --confirm ${params.stage}.`,
    );
  }
  if (params.confirm !== params.stage) {
    throw new Error(
      `Confirmation "${params.confirm}" does not match stage "${params.stage}". ` +
        `Re-run with --confirm ${params.stage}.`,
    );
  }
}

/** Fixed confirmation token required to execute an account-wide cleanup. */
export const CLEANUP_ALL_CONFIRMATION = 'all';

/**
 * Enforce the cleanup execute confirmation policy. Dry-run requires no
 * confirmation. A scoped execute (`--stage <stage>`) requires `--confirm <stage>`;
 * an account-wide execute requires `--confirm all`. Strict equality also rejects
 * empty and whitespace-padded values, mirroring `assertDestroyConfirmation`.
 */
export function assertCleanupConfirmation(params: {
  mode: 'dry-run' | 'execute';
  stageFilter: string | null;
  confirm: string | undefined;
}): void {
  if (params.mode === 'dry-run') {
    return;
  }
  const expected = params.stageFilter ?? CLEANUP_ALL_CONFIRMATION;
  if (params.confirm === undefined) {
    throw new Error(
      `Refusing to execute cleanup without confirmation. Re-run with --confirm ${expected}.`,
    );
  }
  if (params.confirm !== expected) {
    throw new Error(
      `Confirmation "${params.confirm}" does not match required "${expected}". ` +
        `Re-run with --confirm ${expected}.`,
    );
  }
}
