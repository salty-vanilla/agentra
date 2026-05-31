import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { OverviewTab } from '@/components/admin/overview-tab';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render-with-providers';

// Recharts ResponsiveContainer requires ResizeObserver
global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const BASE = 'http://127.0.0.1:8787';

const overviewResponse = {
  requestCount: 10,
  activeUserCount: 3,
  totalTokens: 5000,
  avgDurationMs: 800,
  p95DurationMs: 2000,
  errorRate: 0.1,
  totalToolCalls: 25,
  toolFailureRate: 0.04,
  estimatedCostUsd: 0,
  period: { from: '2026-05-25', to: '2026-05-25' },
};

const timeseriesResponse = {
  buckets: [
    {
      bucketStart: '2026-05-25T00:00:00.000Z',
      requestCount: 10,
      successCount: 9,
      errorCount: 1,
      cancelledCount: 0,
      avgDurationMs: 800,
      p95DurationMs: 2000,
      totalTokens: 5000,
      inputTokens: 3000,
      outputTokens: 2000,
      toolCallCount: 25,
      toolFailureCount: 1,
    },
  ],
  period: { from: '2026-05-25', to: '2026-05-25' },
};

const agentsResponse = {
  agents: [
    {
      agentName: 'research-agent',
      callCount: 8,
      successRate: 0.9,
      errorRate: 0.1,
      avgDurationMs: 1200,
      totalTokens: 3000,
      relatedTools: [],
    },
    {
      agentName: 'slide-agent',
      callCount: 5,
      successRate: 1,
      errorRate: 0,
      avgDurationMs: 2000,
      totalTokens: 2000,
      relatedTools: [],
    },
  ],
};

const toolsResponse = {
  tools: [
    { toolName: 'web_search', callCount: 15, failureRate: 0.05, avgDurationMs: 400 },
    { toolName: 'kb_search', callCount: 10, failureRate: 0, avgDurationMs: 200 },
  ],
};

const skillsResponse = {
  skills: [
    {
      skillName: 'web_research',
      requestCount: 7,
      avgDurationMs: 1000,
      totalTokens: 2000,
      errorRate: 0.1,
    },
  ],
};

const usersResponse = {
  users: [
    {
      userId: 'user-001',
      displayName: '山田 太郎',
      email: 'yamada@example.com',
      requestCount: 6,
      totalTokens: 2000,
      avgDurationMs: 700,
      errorRate: 0.1,
    },
    {
      userId: 'user-002',
      email: 'sato@example.com',
      requestCount: 4,
      totalTokens: 3000,
      avgDurationMs: 900,
      errorRate: 0.0,
    },
  ],
};

function setupHandlers(overrides: { timeseries?: object } = {}) {
  mswServer.use(
    http.get(`${BASE}/admin/observability/overview`, () =>
      HttpResponse.json(overviewResponse),
    ),
    http.get(`${BASE}/admin/observability/timeseries`, () =>
      HttpResponse.json(overrides.timeseries ?? timeseriesResponse),
    ),
    http.get(`${BASE}/admin/observability/agents`, () =>
      HttpResponse.json(agentsResponse),
    ),
    http.get(`${BASE}/admin/observability/tools`, () => HttpResponse.json(toolsResponse)),
    http.get(`${BASE}/admin/observability/skills`, () =>
      HttpResponse.json(skillsResponse),
    ),
    http.get(`${BASE}/admin/observability/users`, () => HttpResponse.json(usersResponse)),
  );
}

describe('OverviewTab charts', () => {
  it('renders stat cards and chart section headings after data loads', async () => {
    setupHandlers();
    renderWithProviders(<OverviewTab from="2026-05-25" to="2026-05-25" />);

    await waitFor(
      () => {
        expect(screen.getAllByText('リクエスト').length).toBeGreaterThan(0);
      },
      { timeout: 3_000 },
    );

    expect(screen.getByText('レイテンシ')).toBeInTheDocument();
    expect(screen.getByText('エラー / 失敗率')).toBeInTheDocument();
    expect(screen.getByText('トークン')).toBeInTheDocument();
  });

  it('renders ranking chart headings', async () => {
    setupHandlers();
    renderWithProviders(<OverviewTab from="2026-05-25" to="2026-05-25" />);

    await waitFor(() => {
      expect(screen.getByText('呼び出し数上位エージェント')).toBeInTheDocument();
    });

    expect(screen.getByText('呼び出し数上位ツール')).toBeInTheDocument();
    expect(screen.getByText('リクエスト数上位スキル')).toBeInTheDocument();
    expect(screen.getByText('リクエスト数上位ユーザー')).toBeInTheDocument();
  });

  it('shows empty state when timeseries has no buckets', async () => {
    setupHandlers({
      timeseries: { buckets: [], period: { from: '2026-05-25', to: '2026-05-25' } },
    });
    renderWithProviders(<OverviewTab from="2026-05-25" to="2026-05-25" />);

    await waitFor(() => {
      expect(
        screen.getAllByText('この期間のデータはありません。').length,
      ).toBeGreaterThan(0);
    });
  });
});
