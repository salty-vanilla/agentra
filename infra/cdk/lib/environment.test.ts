import { describe, expect, it } from 'vitest';
import {
  deriveEnvironmentKind,
  VALID_ENVIRONMENT_KINDS,
  validateEnvironmentKind,
} from './environment.js';

describe('deriveEnvironmentKind', () => {
  it.each([
    ['dev', 'shared-dev'],
    ['prod', 'prod'],
    ['production', 'prod'],
    ['main', 'prod'],
    ['master', 'prod'],
    ['staging', 'prod'],
    ['release', 'prod'],
    ['i252-env-kind', 'ephemeral'],
    ['dev-issue-224', 'ephemeral'],
    ['feature-a1b2', 'ephemeral'],
  ] as const)('stage=%s -> %s', (stage, expected) => {
    expect(deriveEnvironmentKind(stage)).toBe(expected);
  });
});

describe('validateEnvironmentKind', () => {
  it.each(VALID_ENVIRONMENT_KINDS)('accepts valid kind: %s', (kind) => {
    expect(() => validateEnvironmentKind(kind)).not.toThrow();
  });

  it.each([
    'production',
    'foo',
    'PROD',
    'Ephemeral',
    'shared_dev',
    '',
  ])('rejects invalid kind: "%s"', (kind) => {
    expect(() => validateEnvironmentKind(kind)).toThrow(/Invalid environmentKind/);
  });
});
