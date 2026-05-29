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
    })),
    invokeAgentCore: vi.fn(async () => ({ ok: true, latencyMs: 20, timedOut: false })),
    authToken: undefined,
    region: 'us-east-1',
    prompt: 'hi',
    threadId: undefined,
    agentCoreQualifier: 'prod',
    agentCoreTimeoutMs: 120_000,
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
    expect(result.summary).toEqual({ passed: 1, failed: 0, skipped: 3 });

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
    expect(result.summary).toEqual({ passed: 0, failed: 0, skipped: 4 });
  });
});

describe('loadSmokeManifest', () => {
  const valid = manifest('minimal-api', { bffApiUrl: 'https://api.example.com' });

  test('throws a clear error when the manifest file is missing', () => {
    expect(() =>
      loadSmokeManifest('.agentra/preview/pr-307/manifest.json', {
        exists: () => false,
        readJson: <T>() => valid as T,
      }),
    ).toThrow(/No preview manifest at/);
  });

  test('throws when the manifest has no stage', () => {
    expect(() =>
      loadSmokeManifest('m.json', {
        exists: () => true,
        readJson: <T>() => ({ ...valid, stage: '' }) as T,
      }),
    ).toThrow(/missing a "stage"/);
  });

  test('returns the parsed manifest when valid', () => {
    const loaded = loadSmokeManifest('m.json', {
      exists: () => true,
      readJson: <T>() => valid as T,
    });

    expect(loaded.stage).toBe('pr-307');
    expect(loaded.outputs.bffApiUrl).toBe('https://api.example.com');
  });
});
