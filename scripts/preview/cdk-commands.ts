/**
 * Pure builders for the CDK command lines used by preview commands.
 *
 * These functions never touch AWS, the filesystem, or child processes. They
 * exist so the safety-critical command shapes (explicit stack names, never
 * `--all`, preview context flags) are unit-testable in isolation.
 */
import type { PreviewConfig } from './preview-stage.js';

/** Flag that must never appear in a preview deploy command. */
export const FORBIDDEN_DEPLOY_FLAG = '--all';

/**
 * Context flags that select the preview path in the CDK app (#315).
 *
 * `environmentType=preview` is what `resolvePreviewCdkContext` keys on; the
 * remaining values feed guardrail validation and required tags.
 */
export function buildPreviewContextArgs(config: PreviewConfig): string[] {
  return [
    '-c',
    'environmentType=preview',
    '-c',
    `stage=${config.stage}`,
    '-c',
    `previewProfile=${config.profile}`,
    '-c',
    `owner=${config.owner}`,
    '-c',
    `source=${config.source}`,
    '-c',
    `ttlHours=${config.ttlHours}`,
  ];
}

/** `cdk synth --quiet <preview context>` — validates synthesizability, no AWS. */
export function buildCdkSynthArgs(config: PreviewConfig): string[] {
  return ['synth', '--quiet', ...buildPreviewContextArgs(config)];
}

/** `cdk list <preview context>` — enumerates the preview stack names. */
export function buildCdkListArgs(config: PreviewConfig): string[] {
  return ['list', ...buildPreviewContextArgs(config)];
}

/**
 * Keep only stack names under the `<stackPrefix>-` namespace.
 *
 * The trailing hyphen is required: stage `local-foo-aaa` (prefix
 * `AgentraPreview-local-foo-aaa`) must not match the stacks of a different
 * stage `local-foo-aaabbb`.
 */
export function filterPreviewStacks(
  allNames: readonly string[],
  stackPrefix: string,
): string[] {
  const namespace = `${stackPrefix}-`;
  return allNames.filter((name) => name.startsWith(namespace));
}

/**
 * Build `cdk deploy <explicit stacks> --require-approval never --outputs-file <file> <context>`.
 *
 * Refuses to produce a command without explicit stacks and refuses any
 * `--all` usage, so a preview deploy can only ever target named preview stacks.
 */
export function buildCdkDeployArgs(
  config: PreviewConfig,
  stackNames: readonly string[],
  outputsFile: string,
): string[] {
  if (stackNames.length === 0) {
    throw new Error(
      'Refusing to build a preview deploy with no explicit stacks. ' +
        'Preview deploy must target named AgentraPreview-<stage>-* stacks.',
    );
  }
  for (const name of stackNames) {
    if (name.startsWith('--')) {
      throw new Error(
        `Invalid preview stack name "${name}": stack names must not look like CLI flags.`,
      );
    }
  }

  const args = [
    'deploy',
    ...stackNames,
    '--require-approval',
    'never',
    '--outputs-file',
    outputsFile,
    ...buildPreviewContextArgs(config),
  ];

  if (args.includes(FORBIDDEN_DEPLOY_FLAG)) {
    throw new Error('Preview deploy must never use --all.');
  }

  return args;
}
