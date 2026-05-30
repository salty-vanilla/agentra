import { describe, expect, test, vi } from 'vitest';
import type { RawCleanupArgs } from './cleanup-args.js';
import type { CleanupReport } from './cleanup-report.js';
import type { AwsIdentity } from './manifest.js';
import { cleanupDryRunPath, cleanupResultPath } from './paths.js';
import {
  type CleanupDestroyResult,
  type CleanupRuntime,
  runCleanup,
} from './run-cleanup.js';
import type { CandidateStack } from './validate-destroy-target.js';

const IDENTITY: AwsIdentity = {
  accountId: '111122223333',
  region: 'ap-northeast-1',
  arn: 'arn:aws:iam::111122223333:user/test',
};
const FIXED_NOW = new Date('2026-05-30T00:00:00.000Z');
const TIMESTAMP = '2026-05-30T00-00-00-000Z';
const EXPIRED = '2026-05-29T00:00:00.000Z';
const FUTURE = '2026-05-31T00:00:00.000Z';

function tags(stage: string, expiresAt: string): Record<string, string> {
  return {
    Project: 'Agentra',
    EnvironmentType: 'preview',
    Stage: stage,
    ExpiresAt: expiresAt,
  };
}

function args(overrides: Partial<RawCleanupArgs> = {}): RawCleanupArgs {
  return { mode: 'dry-run', ...overrides };
}

function makeRuntime(
  candidates: CandidateStack[],
  destroyResult: CleanupDestroyResult = { deleteRequested: [], deleteFailures: [] },
) {
  const executeDestroyByStage = vi.fn<
    (groups: ReadonlyMap<string, string[]>) => CleanupDestroyResult
  >(() => destroyResult);
  const writeReport = vi.fn<(path: string, report: CleanupReport) => void>();
  const resolveIdentity = vi.fn(() => IDENTITY);
  const describeCandidates = vi.fn(() => candidates);

  const runtime: CleanupRuntime = {
    resolveIdentity,
    describeCandidates,
    executeDestroyByStage,
    writeReport,
    log: () => {},
    now: () => FIXED_NOW,
  };

  return {
    runtime,
    executeDestroyByStage,
    writeReport,
    resolveIdentity,
    describeCandidates,
  };
}

describe('runCleanup — dry-run', () => {
  test('classifies without ever destroying and writes a dry-run report', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-307-Backend', tags: tags('pr-307', EXPIRED) },
    ];
    const { runtime, executeDestroyByStage, writeReport } = makeRuntime(candidates);

    const report = runCleanup(args({ mode: 'dry-run' }), runtime);

    expect(executeDestroyByStage).not.toHaveBeenCalled();
    expect(report.mode).toBe('dry-run');
    expect(report.status).toBe('passed');
    expect(report.summary.eligibleExpired).toBe(1);
    expect(report.deleteRequested).toBeUndefined();
    expect(writeReport).toHaveBeenCalledWith(cleanupDryRunPath(TIMESTAMP), report);
  });
});

describe('runCleanup — execute', () => {
  test('destroys only eligible expired stacks grouped by stage', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-307-Backend', tags: tags('pr-307', EXPIRED) },
      { stackName: 'AgentraPreview-pr-307-DataAuth', tags: tags('pr-307', EXPIRED) },
      { stackName: 'AgentraPreview-pr-308-Backend', tags: tags('pr-308', FUTURE) }, // active
      { stackName: 'AgentraProd-Backend', tags: tags('pr-307', EXPIRED) }, // rejected
      { stackName: 'AgentraPreview-pr-309-Backend', tags: { Project: 'Agentra' } }, // missingTags
    ];
    const { runtime, executeDestroyByStage } = makeRuntime(candidates, {
      deleteRequested: [
        'AgentraPreview-pr-307-Backend',
        'AgentraPreview-pr-307-DataAuth',
      ],
      deleteFailures: [],
    });

    const report = runCleanup(args({ mode: 'execute', confirm: 'all' }), runtime);

    expect(executeDestroyByStage).toHaveBeenCalledTimes(1);
    const groups = executeDestroyByStage.mock.calls[0]?.[0];
    expect([...(groups ?? new Map())]).toEqual([
      ['pr-307', ['AgentraPreview-pr-307-Backend', 'AgentraPreview-pr-307-DataAuth']],
    ]);
    expect(report.status).toBe('passed');
    expect(report.deleteRequested).toEqual([
      'AgentraPreview-pr-307-Backend',
      'AgentraPreview-pr-307-DataAuth',
    ]);
    expect(report.summary).toEqual({
      eligibleExpired: 2,
      activeNotExpired: 1,
      rejectedUnsafe: 1,
      missingTags: 1,
    });
  });

  test('zero eligible is a clean no-op that does not call destroy', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-308-Backend', tags: tags('pr-308', FUTURE) },
    ];
    const { runtime, executeDestroyByStage, writeReport } = makeRuntime(candidates);

    const report = runCleanup(args({ mode: 'execute', confirm: 'all' }), runtime);

    expect(executeDestroyByStage).not.toHaveBeenCalled();
    expect(report.status).toBe('passed');
    expect(report.reason).toMatch(/No expired preview stacks/);
    expect(report.deleteRequested).toEqual([]);
    expect(writeReport).toHaveBeenCalledWith(cleanupResultPath(TIMESTAMP), report);
  });

  test('records a failed status when a stage destroy fails', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-307-Backend', tags: tags('pr-307', EXPIRED) },
    ];
    const { runtime } = makeRuntime(candidates, {
      deleteRequested: [],
      deleteFailures: [{ stackName: 'pr-307', reason: 'cdk destroy failed' }],
    });

    const report = runCleanup(args({ mode: 'execute', confirm: 'all' }), runtime);

    expect(report.status).toBe('failed');
    expect(report.deleteFailures).toEqual([
      { stackName: 'pr-307', reason: 'cdk destroy failed' },
    ]);
  });

  test('scoped execute only considers the matching stage', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-307-Backend', tags: tags('pr-307', EXPIRED) },
      { stackName: 'AgentraPreview-pr-1-Backend', tags: tags('pr-1', EXPIRED) },
    ];
    const { runtime, executeDestroyByStage } = makeRuntime(candidates, {
      deleteRequested: ['AgentraPreview-pr-307-Backend'],
      deleteFailures: [],
    });

    const report = runCleanup(
      args({ mode: 'execute', stage: 'pr-307', confirm: 'pr-307' }),
      runtime,
    );

    const groups = executeDestroyByStage.mock.calls[0]?.[0];
    expect([...(groups ?? new Map())]).toEqual([
      ['pr-307', ['AgentraPreview-pr-307-Backend']],
    ]);
    expect(report.stageFilter).toBe('pr-307');
    expect(report.summary.eligibleExpired).toBe(1);
  });
});

describe('runCleanup — confirmation guard', () => {
  test('execute without confirmation throws before any side effect', () => {
    const {
      runtime,
      resolveIdentity,
      describeCandidates,
      executeDestroyByStage,
      writeReport,
    } = makeRuntime([]);

    expect(() => runCleanup(args({ mode: 'execute' }), runtime)).toThrow(
      /without confirmation/,
    );
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(describeCandidates).not.toHaveBeenCalled();
    expect(executeDestroyByStage).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
  });

  test('account-wide execute rejects a stage-style confirmation', () => {
    const { runtime } = makeRuntime([]);
    expect(() =>
      runCleanup(args({ mode: 'execute', confirm: 'pr-307' }), runtime),
    ).toThrow(/does not match required "all"/);
  });

  test('scoped execute requires --confirm matching the stage', () => {
    const { runtime } = makeRuntime([]);
    expect(() =>
      runCleanup(args({ mode: 'execute', stage: 'pr-307', confirm: 'all' }), runtime),
    ).toThrow(/does not match required "pr-307"/);
  });

  test('an invalid --stage throws before any side effect', () => {
    const { runtime, resolveIdentity } = makeRuntime([]);
    expect(() => runCleanup(args({ mode: 'dry-run', stage: 'prod' }), runtime)).toThrow(
      /Invalid preview stage/,
    );
    expect(resolveIdentity).not.toHaveBeenCalled();
  });
});
