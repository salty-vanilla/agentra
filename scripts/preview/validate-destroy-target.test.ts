import { describe, expect, test } from 'vitest';
import {
  assertDestroyConfirmation,
  type CandidateStack,
  partitionStacks,
  validateDestroyTarget,
} from './validate-destroy-target.js';

const EXPIRES_AT = '2026-05-29T08:00:00.000Z';

function matchingTags(stage: string): Record<string, string> {
  return {
    Project: 'Agentra',
    EnvironmentType: 'preview',
    Stage: stage,
    ExpiresAt: EXPIRES_AT,
  };
}

function stack(stackName: string, tags: Record<string, string>): CandidateStack {
  return { stackName, tags };
}

describe('validateDestroyTarget — accepted', () => {
  test('accepts a pr stage stack with matching name and tags', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-123-Backend', matchingTags('pr-123')),
      'pr-123',
    );
    expect(decision.destroyable).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  test('accepts a local stage stack with matching name and tags', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-local-user-a1b2c3d-Data', matchingTags('local-user-a1b2c3d')),
      'local-user-a1b2c3d',
    );
    expect(decision.destroyable).toBe(true);
  });
});

describe('validateDestroyTarget — rejected', () => {
  test('rejects a non-preview stack name even with preview tags', () => {
    const decision = validateDestroyTarget(
      stack('AgentraDev-Backend', matchingTags('pr-123')),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/does not start with AgentraPreview-/);
  });

  test('rejects a preview stack name without tags', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-123-Backend', {}),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/Project/);
  });

  test('rejects a Stage tag mismatch', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-123-Backend', {
        ...matchingTags('pr-123'),
        Stage: 'pr-999',
      }),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/Stage/);
  });

  test('rejects when ExpiresAt is missing', () => {
    const { ExpiresAt, ...withoutExpiry } = matchingTags('pr-123');
    void ExpiresAt;
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-123-Backend', withoutExpiry),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/ExpiresAt/);
  });

  test('rejects when ExpiresAt is whitespace-only', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-123-Backend', {
        ...matchingTags('pr-123'),
        ExpiresAt: '   ',
      }),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/ExpiresAt/);
  });

  test('rejects a longer stage prefix (pr-1234) when requesting pr-123', () => {
    const decision = validateDestroyTarget(
      stack('AgentraPreview-pr-1234-Backend', matchingTags('pr-1234')),
      'pr-123',
    );
    expect(decision.destroyable).toBe(false);
    expect(decision.reason).toMatch(/AgentraPreview-pr-123-/);
  });

  test('rejects AgentraDev-Backend', () => {
    const decision = validateDestroyTarget(stack('AgentraDev-Backend', {}), 'pr-123');
    expect(decision.destroyable).toBe(false);
  });

  test('rejects AgentraProd-Backend', () => {
    const decision = validateDestroyTarget(stack('AgentraProd-Backend', {}), 'pr-123');
    expect(decision.destroyable).toBe(false);
  });
});

describe('partitionStacks', () => {
  test('splits a mixed list into accepted and rejected', () => {
    const stage = 'pr-123';
    const candidates = [
      stack('AgentraPreview-pr-123-Backend', matchingTags(stage)),
      stack('AgentraPreview-pr-123-DataAuth', matchingTags(stage)),
      stack('AgentraPreview-pr-999-Backend', matchingTags('pr-999')), // other stage
      stack('AgentraDev-Backend', {}),
    ];

    const { accepted, rejected } = partitionStacks(candidates, stage);

    expect(accepted).toEqual([
      'AgentraPreview-pr-123-Backend',
      'AgentraPreview-pr-123-DataAuth',
    ]);
    expect(rejected.map((entry) => entry.stackName)).toEqual([
      'AgentraPreview-pr-999-Backend',
      'AgentraDev-Backend',
    ]);
    expect(rejected[0]?.reason).toMatch(/AgentraPreview-pr-123-/);
  });
});

describe('assertDestroyConfirmation', () => {
  test('throws when confirm is missing for a real destroy', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: undefined, stage: 'pr-123', dryRun: false }),
    ).toThrow(/without confirmation/);
  });

  test('throws when confirm does not match the stage', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: 'pr-999', stage: 'pr-123', dryRun: false }),
    ).toThrow(/does not match stage/);
  });

  test('throws when confirm is an empty string', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: '', stage: 'pr-123', dryRun: false }),
    ).toThrow(/does not match stage/);
  });

  test('throws when confirm is whitespace-padded', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: ' pr-123 ', stage: 'pr-123', dryRun: false }),
    ).toThrow(/does not match stage/);
  });

  test('passes when confirm exactly matches the stage', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: 'pr-123', stage: 'pr-123', dryRun: false }),
    ).not.toThrow();
  });

  test('passes for dry-run without any confirmation', () => {
    expect(() =>
      assertDestroyConfirmation({ confirm: undefined, stage: 'pr-123', dryRun: true }),
    ).not.toThrow();
  });
});
