import { describe, expect, test } from 'vitest';
import {
  aggregateStatus,
  buildSmokeResult,
  type SmokeCheckResult,
  summarizeCounts,
} from './smoke-report.js';

const check = (
  name: string,
  status: SmokeCheckResult['status'],
  extra: Partial<SmokeCheckResult> = {},
): SmokeCheckResult => ({ name, status, ...extra });

describe('aggregateStatus', () => {
  test('returns failed when any check failed', () => {
    const status = aggregateStatus([
      check('bff.health', 'passed'),
      check('bff.threads', 'skipped'),
      check('bff.chatSse', 'failed'),
    ]);

    expect(status).toBe('failed');
  });

  test('returns passed when all checks pass', () => {
    const status = aggregateStatus([
      check('bff.health', 'passed'),
      check('bff.chatSse', 'passed'),
    ]);

    expect(status).toBe('passed');
  });

  test('skipped optional check does not fail the overall status', () => {
    const status = aggregateStatus([
      check('bff.health', 'passed'),
      check('agentcore.invoke', 'skipped'),
    ]);

    expect(status).toBe('passed');
  });

  test('returns skipped only when every check skipped', () => {
    const status = aggregateStatus([
      check('bff.health', 'skipped'),
      check('bff.threads', 'skipped'),
    ]);

    expect(status).toBe('skipped');
  });
});

describe('summarizeCounts', () => {
  test('counts each status', () => {
    const summary = summarizeCounts([
      check('a', 'passed'),
      check('b', 'passed'),
      check('c', 'failed'),
      check('d', 'skipped'),
    ]);

    expect(summary).toEqual({ passed: 2, failed: 1, skipped: 1 });
  });
});

describe('buildSmokeResult', () => {
  test('shapes the result and preserves per-check diagnostics', () => {
    const result = buildSmokeResult({
      stage: 'pr-307',
      profile: 'minimal-api',
      startedAt: '2026-05-28T12:10:00.000Z',
      finishedAt: '2026-05-28T12:10:42.000Z',
      accountId: '111122223333',
      region: 'us-east-1',
      checks: [
        check('bff.health', 'passed', { latencyMs: 120, endpoint: 'https://api/health' }),
        check('bff.threads', 'skipped', { reason: 'test auth is not configured' }),
        check('bff.chatSse', 'failed', {
          reason: 'timed out before terminal event',
          endpoint: 'https://stream/chat',
          timeoutMs: 60000,
          events: ['thread_started', 'token'],
          latencyMs: 60001,
        }),
      ],
    });

    expect(result.project).toBe('Agentra');
    expect(result.environmentType).toBe('preview');
    expect(result.stage).toBe('pr-307');
    expect(result.status).toBe('failed');
    expect(result.summary).toEqual({ passed: 1, failed: 1, skipped: 1 });

    const skipped = result.checks.find((c) => c.name === 'bff.threads');
    expect(skipped?.reason).toBe('test auth is not configured');

    const failed = result.checks.find((c) => c.name === 'bff.chatSse');
    expect(failed?.endpoint).toBe('https://stream/chat');
    expect(failed?.timeoutMs).toBe(60000);
    expect(failed?.events).toEqual(['thread_started', 'token']);
  });

  test('does not mutate the input checks array entries', () => {
    const original = check('bff.health', 'passed');
    const result = buildSmokeResult({
      stage: 'pr-1',
      profile: 'minimal-api',
      startedAt: 'a',
      finishedAt: 'b',
      accountId: null,
      region: null,
      checks: [original],
    });

    const [firstResult] = result.checks;
    if (firstResult) {
      firstResult.status = 'failed';
    }
    expect(original.status).toBe('passed');
  });
});
