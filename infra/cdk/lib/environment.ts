/**
 * Classifies a CDK stage by lifecycle/operational intent.
 *
 * `stage` is the deploy identifier (e.g., "dev", "i252-env-kind").
 * `environmentKind` is derived from (or overrides) `stage` and drives
 * resource deletion policies, lifecycle durations, and op-safety guards.
 *
 * | kind        | RemovalPolicy | autoDeleteObjects | destroy guard |
 * |-------------|---------------|-------------------|---------------|
 * | prod        | RETAIN        | false             | blocked       |
 * | shared-dev  | DESTROY       | true              | blocked       |
 * | ephemeral   | DESTROY       | true              | allowed       |
 * | local       | DESTROY       | true              | allowed       |
 */
export type EnvironmentKind = 'prod' | 'shared-dev' | 'ephemeral' | 'local';

export const VALID_ENVIRONMENT_KINDS: EnvironmentKind[] = [
  'prod',
  'shared-dev',
  'ephemeral',
  'local',
];

const PROD_STAGES = new Set([
  'prod',
  'production',
  'main',
  'master',
  'staging',
  'release',
]);

export function deriveEnvironmentKind(stage: string): EnvironmentKind {
  if (PROD_STAGES.has(stage)) return 'prod';
  if (stage === 'dev') return 'shared-dev';
  return 'ephemeral';
}

/**
 * Validates an explicit environmentKind value from CDK context.
 * Throws if the value is not a recognized EnvironmentKind.
 * Call this only when the caller explicitly provided a value — do not call
 * on auto-derived kinds.
 */
export function validateEnvironmentKind(raw: string): asserts raw is EnvironmentKind {
  if (!(VALID_ENVIRONMENT_KINDS as string[]).includes(raw)) {
    throw new Error(
      `Invalid environmentKind "${raw}". Expected one of: ${VALID_ENVIRONMENT_KINDS.join(', ')}`,
    );
  }
}

export function isDestroyable(kind: EnvironmentKind): boolean {
  return kind !== 'prod';
}
