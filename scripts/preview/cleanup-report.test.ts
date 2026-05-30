import { describe, expect, test } from 'vitest';
import type { CleanupClassification } from './cleanup-classify.js';
import { buildCleanupReport } from './cleanup-report.js';
import type { AwsIdentity } from './manifest.js';

const IDENTITY: AwsIdentity = {
  accountId: '111122223333',
  region: 'ap-northeast-1',
  arn: 'arn:aws:iam::111122223333:user/test',
};

function classification(): CleanupClassification {
  return {
    eligibleExpired: [
      {
        stage: 'pr-307',
        stackName: 'AgentraPreview-pr-307-Backend',
        expiresAt: '2026-05-29T00:00:00.000Z',
      },
    ],
    activeNotExpired: [
      {
        stage: 'pr-308',
        stackName: 'AgentraPreview-pr-308-Backend',
        expiresAt: '2026-05-31T00:00:00.000Z',
      },
    ],
    rejectedUnsafe: [{ stackName: 'AgentraProd-Backend', reason: 'not preview' }],
    missingTags: [],
  };
}

describe('buildCleanupReport', () => {
  test('derives summary counts from the classification', () => {
    const report = buildCleanupReport({
      mode: 'dry-run',
      stageFilter: null,
      startedAt: 'a',
      finishedAt: 'b',
      identity: IDENTITY,
      classification: classification(),
      status: 'passed',
      reason: undefined,
    });

    expect(report.summary).toEqual({
      eligibleExpired: 1,
      activeNotExpired: 1,
      rejectedUnsafe: 1,
      missingTags: 0,
    });
    expect(report.accountId).toBe('111122223333');
    expect(report.region).toBe('ap-northeast-1');
    expect(report.mode).toBe('dry-run');
  });

  test('omits execute-only fields and reason for a dry-run', () => {
    const report = buildCleanupReport({
      mode: 'dry-run',
      stageFilter: null,
      startedAt: 'a',
      finishedAt: 'b',
      identity: IDENTITY,
      classification: classification(),
      status: 'passed',
      reason: undefined,
    });

    expect(report.deleteRequested).toBeUndefined();
    expect(report.deleteFailures).toBeUndefined();
    expect(report.reason).toBeUndefined();
  });

  test('includes deleteRequested / deleteFailures for execute', () => {
    const report = buildCleanupReport({
      mode: 'execute',
      stageFilter: 'pr-307',
      startedAt: 'a',
      finishedAt: 'b',
      identity: IDENTITY,
      classification: classification(),
      deleteRequested: ['AgentraPreview-pr-307-Backend'],
      deleteFailures: [],
      status: 'passed',
      reason: undefined,
    });

    expect(report.deleteRequested).toEqual(['AgentraPreview-pr-307-Backend']);
    expect(report.deleteFailures).toEqual([]);
    expect(report.stageFilter).toBe('pr-307');
  });

  test('falls back to null identity fields when identity is null', () => {
    const report = buildCleanupReport({
      mode: 'dry-run',
      stageFilter: null,
      startedAt: 'a',
      finishedAt: 'b',
      identity: null,
      classification: classification(),
      status: 'passed',
      reason: undefined,
    });

    expect(report.accountId).toBeNull();
    expect(report.region).toBeNull();
  });
});
