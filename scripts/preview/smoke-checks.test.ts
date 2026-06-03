import { describe, expect, test, vi } from 'vitest';
import type { NormalizedOutputs } from './manifest.js';
import type {
  CloudWatchLogCorrelationResult,
  SmokeCheckContext,
  SmokeRuntime,
} from './run-smoke.js';
import {
  checkChatLogCorrelation,
  evaluateLogCorrelation,
  resolveLogGroupNames,
} from './smoke-checks.js';
import type { SmokeCheckResult } from './smoke-report.js';

function correlation(
  overrides: Partial<CloudWatchLogCorrelationResult> = {},
): CloudWatchLogCorrelationResult {
  return {
    ok: false,
    matchedLogGroupNames: [],
    sawRequestStart: false,
    sawRequestEnd: false,
    sawRequestError: false,
    latencyMs: 10,
    timedOut: false,
    ...overrides,
  };
}

describe('resolveLogGroupNames', () => {
  test('prefers the manifest agentCoreLogGroupNames output when present', () => {
    const outputs: NormalizedOutputs = {
      agentCoreLogGroupNames: '/aws/a, /aws/b',
    };
    expect(resolveLogGroupNames(outputs, '/aws/env')).toEqual(['/aws/a', '/aws/b']);
  });

  test('falls back to the comma-separated env value', () => {
    expect(resolveLogGroupNames({}, '/aws/x , /aws/y ,')).toEqual(['/aws/x', '/aws/y']);
  });

  test('returns an empty list when neither source is set', () => {
    expect(resolveLogGroupNames({}, undefined)).toEqual([]);
    expect(resolveLogGroupNames({}, '')).toEqual([]);
  });

  test('de-duplicates repeated log group names', () => {
    expect(resolveLogGroupNames({}, '/aws/x,/aws/x,/aws/y')).toEqual([
      '/aws/x',
      '/aws/y',
    ]);
  });
});

describe('evaluateLogCorrelation', () => {
  test('passes when start and end markers are both present', () => {
    expect(
      evaluateLogCorrelation(
        correlation({ ok: true, sawRequestStart: true, sawRequestEnd: true }),
      ),
    ).toEqual({ status: 'passed' });
  });

  test('passes when start and error markers are present (requestId still propagated)', () => {
    expect(
      evaluateLogCorrelation(
        correlation({ ok: true, sawRequestStart: true, sawRequestError: true }),
      ),
    ).toEqual({ status: 'passed' });
  });

  test('fails when only the start marker is present', () => {
    const result = evaluateLogCorrelation(correlation({ sawRequestStart: true }));
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/agent_request_end or agent_request_error/);
  });

  test('fails when the start marker is missing', () => {
    const result = evaluateLogCorrelation(correlation({ sawRequestEnd: true }));
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/agent_request_start not found/);
  });

  test('fails on timeout', () => {
    const result = evaluateLogCorrelation(correlation({ timedOut: true }));
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/timed out/);
  });

  test('fails and surfaces the underlying error', () => {
    const result = evaluateLogCorrelation(correlation({ error: 'AccessDenied' }));
    expect(result).toEqual({ status: 'failed', reason: 'AccessDenied' });
  });
});

// Minimal runtime stub for driving checkChatLogCorrelation in isolation.
function runtime(overrides: Partial<SmokeRuntime> = {}): SmokeRuntime {
  return {
    httpProbe: vi.fn(),
    consumeSse: vi.fn(),
    invokeAgentCore: vi.fn(),
    searchCloudWatchLogsByRequestId: vi.fn(),
    authToken: 'jwt',
    region: 'us-east-1',
    prompt: 'hi',
    threadId: undefined,
    agentCoreQualifier: 'prod',
    agentCoreTimeoutMs: 1_000,
    mode: 'full',
    logCorrelationEnabled: true,
    logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
    logWaitMs: 60_000,
    logPollIntervalMs: 5_000,
    now: () => new Date('2026-05-28T12:00:00.000Z'),
    log: () => {},
    ...overrides,
  } as SmokeRuntime;
}

function context(...previousResults: SmokeCheckResult[]): SmokeCheckContext {
  return { previousResults };
}

const manifest = {
  outputs: {} as NormalizedOutputs,
} as Parameters<typeof checkChatLogCorrelation>[0];

describe('checkChatLogCorrelation', () => {
  test('fails when chatSse ran but produced no requestId', async () => {
    const result = await checkChatLogCorrelation(
      manifest,
      runtime(),
      context({ name: 'bff.chatSse', status: 'passed' }),
    );
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/no requestId captured/);
  });

  test('passes the startTime window and requestId to the search', async () => {
    const search = vi.fn(async () =>
      correlation({ ok: true, sawRequestStart: true, sawRequestEnd: true }),
    );
    const result = await checkChatLogCorrelation(
      manifest,
      runtime({ searchCloudWatchLogsByRequestId: search }),
      context({ name: 'bff.chatSse', status: 'passed', requestId: 'req-9' }),
    );

    expect(result.status).toBe('passed');
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-9',
        // 10-minute lookback before the runtime clock.
        startTimeMs: new Date('2026-05-28T12:00:00.000Z').getTime() - 10 * 60_000,
      }),
    );
  });
});
