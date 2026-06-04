import { describe, expect, test, vi } from 'vitest';
import type { NormalizedOutputs, PreviewManifest } from './manifest.js';
import { loadSmokeManifest, runSmoke, type SmokeRuntime } from './run-smoke.js';
import type { SseEventName } from './smoke-sse.js';

function manifest(profile: string, outputs: NormalizedOutputs): PreviewManifest {
  return {
    project: 'Agentra',
    environmentType: 'preview',
    stage: 'pr-307',
    profile,
    owner: 'unknown',
    source: 'human',
    createdAt: '2026-05-28T12:00:00.000Z',
    expiresAt: '2026-05-28T20:00:00.000Z',
    accountId: '111122223333',
    region: 'us-east-1',
    stacks: [],
    tags: {},
    outputs,
  };
}

function runtime(overrides: Partial<SmokeRuntime> = {}): SmokeRuntime {
  return {
    httpProbe: vi.fn(async () => ({
      status: 200,
      latencyMs: 5,
      bodyJson: { status: 'ok', threads: [] },
      timedOut: false,
    })),
    consumeSse: vi.fn(async () => ({
      opened: true,
      events: ['thread_started', 'token', 'done'] as SseEventName[],
      gotTerminal: true,
      terminalIsSuccess: true,
      latencyMs: 10,
      timedOut: false,
      requestId: 'req-default',
    })),
    invokeAgentCore: vi.fn(async () => ({ ok: true, latencyMs: 20, timedOut: false })),
    searchCloudWatchLogsByRequestId: vi.fn(async () => ({
      ok: true,
      matchedLogGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
      sawRequestStart: true,
      sawRequestEnd: true,
      sawRequestError: false,
      latencyMs: 30,
      timedOut: false,
    })),
    authToken: undefined,
    region: 'us-east-1',
    prompt: 'hi',
    threadId: undefined,
    agentCoreQualifier: 'prod',
    agentCoreTimeoutMs: 120_000,
    mode: 'full',
    logCorrelationEnabled: false,
    logGroupNames: [],
    logWaitMs: 60_000,
    logPollIntervalMs: 5_000,
    now: () => new Date('2026-05-28T12:00:00.000Z'),
    log: () => {},
    ...overrides,
  };
}

describe('runSmoke', () => {
  test('health passes; auth/profile-gated checks skip without failing overall', async () => {
    const result = await runSmoke(
      manifest('minimal-api', { bffApiUrl: 'https://api.example.com' }),
      runtime(),
    );

    expect(result.status).toBe('passed');
    expect(result.summary).toEqual({ passed: 1, failed: 0, skipped: 4 });

    const threads = result.checks.find((c) => c.name === 'bff.threads');
    expect(threads?.status).toBe('skipped');
    expect(threads?.reason).toMatch(/test auth/);
  });

  test('a failed required check fails the overall status', async () => {
    const result = await runSmoke(
      manifest('minimal-api', { bffApiUrl: 'https://api.example.com' }),
      runtime({
        httpProbe: vi.fn(async () => ({ status: 503, latencyMs: 3, timedOut: false })),
      }),
    );

    expect(result.status).toBe('failed');
    const health = result.checks.find((c) => c.name === 'bff.health');
    expect(health?.status).toBe('failed');
    expect(health?.reason).toMatch(/unexpected status 503/);
  });

  test('missing optional AgentCore output skips the check without failing', async () => {
    const result = await runSmoke(
      manifest('backend-ai', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({ authToken: 'jwt-token' }),
    );

    expect(result.status).toBe('passed');
    const agentcore = result.checks.find((c) => c.name === 'agentcore.invoke');
    expect(agentcore?.status).toBe('skipped');
    expect(agentcore?.reason).toMatch(/agentCoreRuntimeArn not present/);
  });

  test('chat SSE timeout records endpoint, timeoutMs, and partial events', async () => {
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        consumeSse: vi.fn(async () => ({
          opened: true,
          events: ['thread_started'] as SseEventName[],
          gotTerminal: false,
          terminalIsSuccess: false,
          latencyMs: 60_001,
          timedOut: true,
        })),
      }),
    );

    expect(result.status).toBe('failed');
    const chat = result.checks.find((c) => c.name === 'bff.chatSse');
    expect(chat?.status).toBe('failed');
    expect(chat?.endpoint).toBe('https://stream.example.com/chat');
    expect(chat?.timeoutMs).toBe(60_000);
    expect(chat?.events).toEqual(['thread_started']);
    expect(chat?.reason).toMatch(/timed out/);
  });

  test('all-skipped run produces an overall skipped status', async () => {
    const result = await runSmoke(manifest('minimal-api', {}), runtime());

    expect(result.status).toBe('skipped');
    expect(result.summary).toEqual({ passed: 0, failed: 0, skipped: 5 });
  });

  test('core mode runs only the cheap GET checks and skips the full-tier ones', async () => {
    const consumeSse = vi.fn();
    const invokeAgentCore = vi.fn();
    const search = vi.fn();
    const result = await runSmoke(
      manifest('backend-ai', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
        agentCoreRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:1:runtime/x',
      }),
      runtime({
        mode: 'core',
        authToken: 'jwt-token',
        logCorrelationEnabled: true,
        logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
        consumeSse,
        invokeAgentCore,
        searchCloudWatchLogsByRequestId: search,
      }),
    );

    expect(result.status).toBe('passed');
    expect(result.checks.find((c) => c.name === 'bff.health')?.status).toBe('passed');
    expect(result.checks.find((c) => c.name === 'bff.threads')?.status).toBe('passed');
    for (const name of ['bff.chatSse', 'bff.chatLogCorrelation', 'agentcore.invoke']) {
      const check = result.checks.find((c) => c.name === name);
      expect(check?.status).toBe('skipped');
      expect(check?.reason).toMatch(/--mode full/);
    }
    // Heavy probes must not be invoked in core mode.
    expect(consumeSse).not.toHaveBeenCalled();
    expect(invokeAgentCore).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  test('chatSse passing surfaces requestId/traceId/threadId on the result', async () => {
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        consumeSse: vi.fn(async () => ({
          opened: true,
          events: ['thread_started', 'done'] as SseEventName[],
          gotTerminal: true,
          terminalIsSuccess: true,
          latencyMs: 12,
          timedOut: false,
          requestId: 'req-123',
          traceId: 'trace-abc',
          threadId: 't-1',
        })),
      }),
    );

    const chat = result.checks.find((c) => c.name === 'bff.chatSse');
    expect(chat?.status).toBe('passed');
    expect(chat?.requestId).toBe('req-123');
    expect(chat?.traceId).toBe('trace-abc');
    expect(chat?.threadId).toBe('t-1');
  });

  test('chatSse without a requestId in the done payload fails', async () => {
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        consumeSse: vi.fn(async () => ({
          opened: true,
          events: ['thread_started', 'done'] as SseEventName[],
          gotTerminal: true,
          terminalIsSuccess: true,
          latencyMs: 12,
          timedOut: false,
        })),
      }),
    );

    expect(result.status).toBe('failed');
    const chat = result.checks.find((c) => c.name === 'bff.chatSse');
    expect(chat?.status).toBe('failed');
    expect(chat?.reason).toMatch(/requestId/);
  });

  test('log correlation disabled: chatLogCorrelation skips and never searches', async () => {
    const search = vi.fn();
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        logCorrelationEnabled: false,
        searchCloudWatchLogsByRequestId: search,
      }),
    );

    const corr = result.checks.find((c) => c.name === 'bff.chatLogCorrelation');
    expect(corr?.status).toBe('skipped');
    expect(corr?.reason).toMatch(/not enabled/);
    expect(search).not.toHaveBeenCalled();
  });

  test('log correlation enabled with a requestId calls the CloudWatch search', async () => {
    const search = vi.fn(async () => ({
      ok: true,
      matchedLogGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
      sawRequestStart: true,
      sawRequestEnd: true,
      sawRequestError: false,
      latencyMs: 42,
      timedOut: false,
    }));
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        logCorrelationEnabled: true,
        logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
        searchCloudWatchLogsByRequestId: search,
        consumeSse: vi.fn(async () => ({
          opened: true,
          events: ['done'] as SseEventName[],
          gotTerminal: true,
          terminalIsSuccess: true,
          latencyMs: 8,
          timedOut: false,
          requestId: 'req-xyz',
        })),
      }),
    );

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-xyz',
        logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
      }),
    );
    const corr = result.checks.find((c) => c.name === 'bff.chatLogCorrelation');
    expect(corr?.status).toBe('passed');
    expect(corr?.requestId).toBe('req-xyz');
    expect(corr?.sawRequestStart).toBe(true);
    expect(corr?.matchedLogGroupNames).toEqual([
      '/aws/bedrock-agentcore/runtimes/agentcore-pr-307',
    ]);
  });

  test('log correlation enabled but no log groups: skips with a reason', async () => {
    const search = vi.fn();
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        logCorrelationEnabled: true,
        logGroupNames: [],
        searchCloudWatchLogsByRequestId: search,
      }),
    );

    const corr = result.checks.find((c) => c.name === 'bff.chatLogCorrelation');
    expect(corr?.status).toBe('skipped');
    expect(corr?.reason).toMatch(/log groups/);
    expect(search).not.toHaveBeenCalled();
  });

  test('log correlation enabled but chatSse skipped (no auth): correlation skips', async () => {
    const search = vi.fn();
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: undefined,
        logCorrelationEnabled: true,
        logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
        searchCloudWatchLogsByRequestId: search,
      }),
    );

    const corr = result.checks.find((c) => c.name === 'bff.chatLogCorrelation');
    expect(corr?.status).toBe('skipped');
    expect(corr?.reason).toMatch(/bff\.chatSse did not run/);
    expect(search).not.toHaveBeenCalled();
  });

  test('log correlation timeout fails the overall status', async () => {
    const result = await runSmoke(
      manifest('minimal-api', {
        bffApiUrl: 'https://api.example.com',
        streamingApiUrl: 'https://stream.example.com',
      }),
      runtime({
        authToken: 'jwt-token',
        logCorrelationEnabled: true,
        logGroupNames: ['/aws/bedrock-agentcore/runtimes/agentcore-pr-307'],
        searchCloudWatchLogsByRequestId: vi.fn(async () => ({
          ok: false,
          matchedLogGroupNames: [],
          sawRequestStart: false,
          sawRequestEnd: false,
          sawRequestError: false,
          latencyMs: 60_000,
          timedOut: true,
        })),
        consumeSse: vi.fn(async () => ({
          opened: true,
          events: ['done'] as SseEventName[],
          gotTerminal: true,
          terminalIsSuccess: true,
          latencyMs: 8,
          timedOut: false,
          requestId: 'req-timeout',
        })),
      }),
    );

    expect(result.status).toBe('failed');
    const corr = result.checks.find((c) => c.name === 'bff.chatLogCorrelation');
    expect(corr?.status).toBe('failed');
    expect(corr?.reason).toMatch(/timed out/);
  });
});

describe('loadSmokeManifest', () => {
  const valid = manifest('minimal-api', { bffApiUrl: 'https://api.example.com' });

  test('throws a clear error when the manifest file is missing', () => {
    expect(() =>
      loadSmokeManifest('.agentra/preview/pr-307/manifest.json', 'pr-307', {
        exists: () => false,
        readJson: <T>() => valid as T,
      }),
    ).toThrow(/No preview manifest at/);
  });

  test('throws when the manifest has no stage', () => {
    expect(() =>
      loadSmokeManifest('m.json', 'pr-307', {
        exists: () => true,
        readJson: <T>() => ({ ...valid, stage: '' }) as T,
      }),
    ).toThrow(/missing a "stage"/);
  });

  test('throws when the manifest stage does not match --stage', () => {
    expect(() =>
      loadSmokeManifest('.agentra/preview/pr-308/manifest.json', 'pr-307', {
        exists: () => true,
        readJson: <T>() => ({ ...valid, stage: 'pr-308' }) as T,
      }),
    ).toThrow(/stage mismatch: --stage=pr-307, manifest\.stage=pr-308/);
  });

  test('returns the parsed manifest when valid', () => {
    const loaded = loadSmokeManifest('m.json', 'pr-307', {
      exists: () => true,
      readJson: <T>() => valid as T,
    });

    expect(loaded.stage).toBe('pr-307');
    expect(loaded.outputs.bffApiUrl).toBe('https://api.example.com');
  });
});
