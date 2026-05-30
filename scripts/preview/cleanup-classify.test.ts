import { describe, expect, test } from 'vitest';
import { classifyStacks, parseExpiresAt } from './cleanup-classify.js';
import type { CandidateStack } from './validate-destroy-target.js';

const NOW = new Date('2026-05-30T00:00:00.000Z');
const EXPIRED = '2026-05-29T00:00:00.000Z';
const FUTURE = '2026-05-31T00:00:00.000Z';

function previewTags(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Project: 'Agentra',
    EnvironmentType: 'preview',
    Stage: 'pr-307',
    ExpiresAt: EXPIRED,
    ...overrides,
  };
}

function stack(stackName: string, tags: Record<string, string>): CandidateStack {
  return { stackName, tags };
}

describe('parseExpiresAt', () => {
  test('parses a well-formed ISO 8601 timestamp', () => {
    expect(parseExpiresAt('2026-05-29T08:00:00.000Z')).toBe(
      Date.parse('2026-05-29T08:00:00.000Z'),
    );
  });

  test('returns null for a non-ISO string', () => {
    expect(parseExpiresAt('not-a-date')).toBeNull();
    expect(parseExpiresAt('2026')).toBeNull();
  });

  test('returns null for an impossible date', () => {
    expect(parseExpiresAt('2026-13-99T00:00:00Z')).toBeNull();
  });
});

describe('classifyStacks — eligibility', () => {
  test('expired preview stack is eligible', () => {
    const candidates = [stack('AgentraPreview-pr-307-Backend', previewTags())];

    const result = classifyStacks(candidates, NOW);

    expect(result.eligibleExpired).toEqual([
      { stage: 'pr-307', stackName: 'AgentraPreview-pr-307-Backend', expiresAt: EXPIRED },
    ]);
  });

  test('non-expired preview stack is active', () => {
    const candidates = [
      stack('AgentraPreview-pr-307-Backend', previewTags({ ExpiresAt: FUTURE })),
    ];

    const result = classifyStacks(candidates, NOW);

    expect(result.activeNotExpired).toHaveLength(1);
    expect(result.eligibleExpired).toHaveLength(0);
  });
});

describe('classifyStacks — rejections', () => {
  test('missing ExpiresAt is missingTags', () => {
    const tags = previewTags();
    delete tags.ExpiresAt;
    const result = classifyStacks([stack('AgentraPreview-pr-307-Backend', tags)], NOW);

    expect(result.missingTags).toHaveLength(1);
    expect(result.missingTags[0]?.reason).toMatch(/missing ExpiresAt tag/);
  });

  test('absent EnvironmentType is missingTags', () => {
    const tags = previewTags();
    delete tags.EnvironmentType;
    const result = classifyStacks([stack('AgentraPreview-pr-307-Backend', tags)], NOW);

    expect(result.missingTags).toHaveLength(1);
    expect(result.missingTags[0]?.reason).toMatch(/missing EnvironmentType tag/);
  });

  test('wrong-value EnvironmentType is rejectedUnsafe', () => {
    const result = classifyStacks(
      [stack('AgentraPreview-pr-307-Backend', previewTags({ EnvironmentType: 'prod' }))],
      NOW,
    );

    expect(result.rejectedUnsafe).toHaveLength(1);
    expect(result.rejectedUnsafe[0]?.reason).toMatch(/EnvironmentType/);
  });

  test('non-preview stack name with preview tags is rejectedUnsafe', () => {
    const result = classifyStacks([stack('SomethingElse-Backend', previewTags())], NOW);

    expect(result.rejectedUnsafe).toHaveLength(1);
    expect(result.rejectedUnsafe[0]?.reason).toMatch(/AgentraPreview-/);
  });

  test('AgentraProd-* is rejectedUnsafe', () => {
    const result = classifyStacks([stack('AgentraProd-Backend', previewTags())], NOW);

    expect(result.rejectedUnsafe).toHaveLength(1);
    expect(result.eligibleExpired).toHaveLength(0);
  });

  test('malformed ExpiresAt is rejectedUnsafe', () => {
    const result = classifyStacks(
      [stack('AgentraPreview-pr-307-Backend', previewTags({ ExpiresAt: 'soon' }))],
      NOW,
    );

    expect(result.rejectedUnsafe).toHaveLength(1);
    expect(result.rejectedUnsafe[0]?.reason).toMatch(/malformed ExpiresAt/);
  });

  test('malformed/forbidden Stage tag is rejectedUnsafe before being trusted', () => {
    const result = classifyStacks(
      [
        stack('AgentraPreview-prod-Backend', previewTags({ Stage: 'prod' })),
        stack('AgentraPreview-bad-Backend', previewTags({ Stage: 'not a stage' })),
      ],
      NOW,
    );

    expect(result.rejectedUnsafe).toHaveLength(2);
    expect(result.rejectedUnsafe[0]?.reason).toMatch(/not a valid preview stage/);
    expect(result.eligibleExpired).toHaveLength(0);
  });
});

describe('classifyStacks — stage filter', () => {
  test('includes only the matching stage and rejects near-miss name/tag mismatches', () => {
    const candidates = [
      stack('AgentraPreview-pr-307-Backend', previewTags({ Stage: 'pr-307' })),
      // Other stage entirely — out of scope, ignored.
      stack('AgentraPreview-pr-1-Backend', previewTags({ Stage: 'pr-1' })),
      // Name says pr-307 but Stage tag differs — in scope (near-miss), rejected.
      stack('AgentraPreview-pr-307-DataAuth', previewTags({ Stage: 'pr-999' })),
    ];

    const result = classifyStacks(candidates, NOW, 'pr-307');

    expect(result.eligibleExpired).toEqual([
      { stage: 'pr-307', stackName: 'AgentraPreview-pr-307-Backend', expiresAt: EXPIRED },
    ]);
    expect(result.rejectedUnsafe).toHaveLength(1);
    expect(result.rejectedUnsafe[0]?.stackName).toBe('AgentraPreview-pr-307-DataAuth');
    // pr-1 is neither in eligible nor rejected — it was filtered out of scope.
    expect(result.activeNotExpired).toHaveLength(0);
  });
});
