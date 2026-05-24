import type { ObservabilityRecord } from '@agentra/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import {
  putObservabilityRecord,
  resetObservabilityStore,
} from '../store/observability-store.js';

function makeRecord(overrides: Partial<ObservabilityRecord> = {}): ObservabilityRecord {
  return {
    traceId: 'trace-001',
    requestId: 'req-001',
    threadId: 'thread-001',
    userId: 'user-demo-001',
    startedAt: '2026-05-23T10:00:00.000Z',
    completedAt: '2026-05-23T10:00:05.000Z',
    durationMs: 5000,
    status: 'success',
    toolCalls: [],
    agentCalls: [],
    skillCalls: [],
    toolCallCount: 0,
    toolFailureCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    createdAt: '2026-05-23T10:00:05.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}

describe('Admin Observability API', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
    resetObservabilityStore();
  });

  afterEach(() => {
    delete process.env.SKIP_AUTH;
    delete process.env.STORE_TYPE;
    resetObservabilityStore();
  });

  describe('GET /admin/observability/overview', () => {
    it('returns 200 with overview stats shape', async () => {
      const res = await app.request('/admin/observability/overview');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('requestCount');
      expect(body).toHaveProperty('activeUserCount');
      expect(body).toHaveProperty('totalTokens');
      expect(body).toHaveProperty('avgDurationMs');
      expect(body).toHaveProperty('p95DurationMs');
      expect(body).toHaveProperty('errorRate');
      expect(body).toHaveProperty('totalToolCalls');
      expect(body).toHaveProperty('toolFailureRate');
      expect(body).toHaveProperty('estimatedCostUsd');
      expect(body).toHaveProperty('period');
    });

    it('reflects seeded records in counts', async () => {
      await putObservabilityRecord(makeRecord({ traceId: 't1' }));
      await putObservabilityRecord(makeRecord({ traceId: 't2', status: 'error' }));

      const res = await app.request(
        '/admin/observability/overview?from=2026-05-23&to=2026-05-23',
      );
      const body = await res.json();
      expect(body.requestCount).toBe(2);
      expect(body.errorRate).toBeCloseTo(0.5);
    });

    it('returns 400 for invalid date format', async () => {
      const res = await app.request('/admin/observability/overview?from=not-a-date');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/observability/users', () => {
    it('returns 200 with users array', async () => {
      await putObservabilityRecord(makeRecord({ traceId: 't1', userId: 'u1' }));
      await putObservabilityRecord(makeRecord({ traceId: 't2', userId: 'u2' }));

      const res = await app.request(
        '/admin/observability/users?from=2026-05-23&to=2026-05-23',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.users)).toBe(true);
      expect(body.users).toHaveLength(2);
    });

    it('paginates with limit and cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await putObservabilityRecord(
          makeRecord({ traceId: `t${i}`, userId: `user-${i}` }),
        );
      }

      const res1 = await app.request(
        '/admin/observability/users?from=2026-05-23&to=2026-05-23&limit=3',
      );
      const body1 = await res1.json();
      expect(body1.users).toHaveLength(3);
      expect(body1.cursor).toBeDefined();

      const res2 = await app.request(
        `/admin/observability/users?from=2026-05-23&to=2026-05-23&limit=3&cursor=${body1.cursor}`,
      );
      const body2 = await res2.json();
      expect(body2.users).toHaveLength(2);
      expect(body2.cursor).toBeUndefined();
    });
  });

  describe('GET /admin/observability/agents', () => {
    it('returns 200 with agents array', async () => {
      await putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          agentCalls: [{ agentName: 'AgentAlpha', durationMs: 1000, status: 'success' }],
          agentCallCount: 1,
        }),
      );

      const res = await app.request(
        '/admin/observability/agents?from=2026-05-23&to=2026-05-23',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.agents[0]?.agentName).toBe('AgentAlpha');
    });
  });

  describe('GET /admin/observability/tools', () => {
    it('returns 200 with tools array', async () => {
      await putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          toolCalls: [
            {
              toolCallId: 'tc1',
              toolName: 'search',
              startedAt: '2026-05-23T10:00:00.000Z',
              durationMs: 100,
              status: 'success',
            },
          ],
          toolCallCount: 1,
        }),
      );

      const res = await app.request(
        '/admin/observability/tools?from=2026-05-23&to=2026-05-23',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools[0]?.toolName).toBe('search');
    });
  });

  describe('GET /admin/observability/skills', () => {
    it('returns 200 with skills array', async () => {
      await putObservabilityRecord(
        makeRecord({
          traceId: 't1',
          skillCalls: [
            { skillName: 'web_research', durationMs: 1000, status: 'success' },
          ],
          skillCallCount: 1,
        }),
      );

      const res = await app.request(
        '/admin/observability/skills?from=2026-05-23&to=2026-05-23',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.skills)).toBe(true);
      expect(body.skills[0]?.skillName).toBe('web_research');
    });
  });

  describe('GET /admin/observability/traces', () => {
    it('returns 200 with traces array', async () => {
      await putObservabilityRecord(
        makeRecord({ traceId: 'trace-xyz', userId: 'user-demo-001' }),
      );

      const res = await app.request(
        '/admin/observability/traces?from=2026-05-23&to=2026-05-23',
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.traces)).toBe(true);
    });

    it('filters by status', async () => {
      await putObservabilityRecord(makeRecord({ traceId: 't1', status: 'success' }));
      await putObservabilityRecord(makeRecord({ traceId: 't2', status: 'error' }));

      const res = await app.request(
        '/admin/observability/traces?from=2026-05-23&to=2026-05-23&status=error',
      );
      const body = await res.json();
      expect(body.traces.every((t: { status: string }) => t.status === 'error')).toBe(
        true,
      );
      expect(body.traces).toHaveLength(1);
    });

    it('filters by userId', async () => {
      await putObservabilityRecord(makeRecord({ traceId: 't1', userId: 'user-A' }));
      await putObservabilityRecord(makeRecord({ traceId: 't2', userId: 'user-B' }));

      const res = await app.request(
        '/admin/observability/traces?from=2026-05-23&to=2026-05-23&userId=user-A',
      );
      const body = await res.json();
      expect(body.traces.every((t: { userId: string }) => t.userId === 'user-A')).toBe(
        true,
      );
      expect(body.traces).toHaveLength(1);
    });

    it('paginates with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await putObservabilityRecord(makeRecord({ traceId: `t${i}` }));
      }

      const res1 = await app.request(
        '/admin/observability/traces?from=2026-05-23&to=2026-05-23&limit=3',
      );
      const body1 = await res1.json();
      expect(body1.traces).toHaveLength(3);
      expect(body1.cursor).toBeDefined();
    });
  });

  describe('GET /admin/observability/traces/:traceId', () => {
    it('returns 200 with trace detail', async () => {
      await putObservabilityRecord(makeRecord({ traceId: 'detail-trace-001' }));

      const res = await app.request('/admin/observability/traces/detail-trace-001');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.trace.traceId).toBe('detail-trace-001');
      expect(body.trace).toHaveProperty('requestId');
      expect(body.trace).toHaveProperty('threadId');
      expect(body.trace).toHaveProperty('toolCalls');
    });

    it('returns 404 for unknown traceId', async () => {
      const res = await app.request('/admin/observability/traces/does-not-exist');
      expect(res.status).toBe(404);
    });
  });
});
