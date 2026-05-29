import { describe, expect, test, vi } from 'vitest';
import type { RawDestroyArgs } from './destroy-args.js';
import type { DestroyReport } from './destroy-report.js';
import type { AwsIdentity } from './manifest.js';
import { destroyDryRunPath, destroyResultPath } from './paths.js';
import { type DestroyRuntime, runDestroy } from './run-destroy.js';
import type { CandidateStack } from './validate-destroy-target.js';

const STAGE = 'pr-123';
const IDENTITY: AwsIdentity = {
  accountId: '111122223333',
  region: 'ap-northeast-1',
  arn: 'arn:aws:iam::111122223333:user/test',
};
const FIXED_NOW = new Date('2026-05-29T00:00:00.000Z');

function tags(stage = STAGE): Record<string, string> {
  return {
    Project: 'Agentra',
    EnvironmentType: 'preview',
    Stage: stage,
    ExpiresAt: '2026-05-29T08:00:00.000Z',
  };
}

function args(overrides: Partial<RawDestroyArgs> = {}): RawDestroyArgs {
  return { stage: STAGE, profile: 'minimal-api', dryRun: false, ...overrides };
}

function makeRuntime(candidates: CandidateStack[]) {
  const executeDestroy = vi.fn<(config: unknown, names: readonly string[]) => void>();
  const writeReport = vi.fn<(path: string, report: DestroyReport) => void>();
  const resolveIdentity = vi.fn(() => IDENTITY);
  const describeCandidates = vi.fn(() => candidates);

  const runtime: DestroyRuntime = {
    resolveIdentity,
    describeCandidates,
    executeDestroy,
    writeReport,
    log: () => {},
    now: () => FIXED_NOW,
  };

  return { runtime, executeDestroy, writeReport, resolveIdentity, describeCandidates };
}

describe('runDestroy — dry-run', () => {
  test('never calls executeDestroy even when stacks would be destroyed', () => {
    const candidates = [{ stackName: 'AgentraPreview-pr-123-Backend', tags: tags() }];
    const { runtime, executeDestroy, writeReport } = makeRuntime(candidates);

    const report = runDestroy(args({ dryRun: true }), runtime);

    expect(executeDestroy).not.toHaveBeenCalled();
    expect(report.status).toBe('passed');
    expect(report.acceptedStacks).toEqual(['AgentraPreview-pr-123-Backend']);
    expect(report.requestedDestroyStacks).toEqual([]);
    expect(writeReport).toHaveBeenCalledWith(destroyDryRunPath(STAGE), report);
  });

  test('reports passed with a reason when nothing is destroyable', () => {
    const { runtime, writeReport } = makeRuntime([]);

    const report = runDestroy(args({ dryRun: true }), runtime);

    expect(report.status).toBe('passed');
    expect(report.reason).toMatch(/No destroyable stacks found/);
    expect(writeReport).toHaveBeenCalledWith(destroyDryRunPath(STAGE), report);
  });
});

describe('runDestroy — real destroy', () => {
  test('fails without calling executeDestroy when no stacks are accepted', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-999-Backend', tags: tags('pr-999') },
    ];
    const { runtime, executeDestroy, writeReport } = makeRuntime(candidates);

    const report = runDestroy(args({ confirm: STAGE }), runtime);

    expect(executeDestroy).not.toHaveBeenCalled();
    expect(report.status).toBe('failed');
    expect(report.reason).toMatch(/No destroyable stacks found/);
    expect(report.requestedDestroyStacks).toEqual([]);
    expect(writeReport).toHaveBeenCalledWith(destroyResultPath(STAGE), report);
  });

  test('destroys exactly the accepted stacks and writes a passed result', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-123-Backend', tags: tags() },
      { stackName: 'AgentraPreview-pr-123-DataAuth', tags: tags() },
    ];
    const { runtime, executeDestroy, writeReport } = makeRuntime(candidates);

    const report = runDestroy(args({ confirm: STAGE }), runtime);

    expect(executeDestroy).toHaveBeenCalledTimes(1);
    expect(executeDestroy.mock.calls[0]?.[1]).toEqual([
      'AgentraPreview-pr-123-Backend',
      'AgentraPreview-pr-123-DataAuth',
    ]);
    expect(report.status).toBe('passed');
    expect(report.requestedDestroyStacks).toEqual(report.acceptedStacks);
    expect(writeReport).toHaveBeenCalledWith(destroyResultPath(STAGE), report);
  });

  test('passes only accepted stacks even when rejected stacks are present', () => {
    const candidates = [
      { stackName: 'AgentraPreview-pr-123-Backend', tags: tags() },
      { stackName: 'AgentraPreview-pr-999-Backend', tags: tags('pr-999') },
      { stackName: 'AgentraProd-Backend', tags: {} },
    ];
    const { runtime, executeDestroy } = makeRuntime(candidates);

    const report = runDestroy(args({ confirm: STAGE }), runtime);

    expect(executeDestroy).toHaveBeenCalledTimes(1);
    expect(executeDestroy.mock.calls[0]?.[1]).toEqual(['AgentraPreview-pr-123-Backend']);
    expect(report.status).toBe('passed');
    expect(report.rejectedStacks).toHaveLength(2);
  });

  test('writes a failed report when executeDestroy throws', () => {
    const candidates = [{ stackName: 'AgentraPreview-pr-123-Backend', tags: tags() }];
    const { runtime, executeDestroy, writeReport } = makeRuntime(candidates);
    executeDestroy.mockImplementation(() => {
      throw new Error('boom');
    });

    const report = runDestroy(args({ confirm: STAGE }), runtime);

    expect(report.status).toBe('failed');
    expect(report.reason).toMatch(/cdk destroy failed: boom/);
    expect(report.requestedDestroyStacks).toEqual([]);
    expect(writeReport).toHaveBeenCalledWith(destroyResultPath(STAGE), report);
  });
});

describe('runDestroy — confirmation guard', () => {
  test('missing confirm throws before any AWS or report side effect', () => {
    const { runtime, resolveIdentity, describeCandidates, executeDestroy, writeReport } =
      makeRuntime([]);

    expect(() => runDestroy(args(), runtime)).toThrow(/without confirmation/);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(describeCandidates).not.toHaveBeenCalled();
    expect(executeDestroy).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
  });

  test('mismatched confirm throws before any AWS or report side effect', () => {
    const { runtime, resolveIdentity, describeCandidates, executeDestroy, writeReport } =
      makeRuntime([]);

    expect(() => runDestroy(args({ confirm: 'pr-999' }), runtime)).toThrow(
      /does not match stage/,
    );
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(describeCandidates).not.toHaveBeenCalled();
    expect(executeDestroy).not.toHaveBeenCalled();
    expect(writeReport).not.toHaveBeenCalled();
  });
});
