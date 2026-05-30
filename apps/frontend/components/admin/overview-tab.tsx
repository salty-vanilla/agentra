'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartEmptyState,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  adminAgentsQueryOptions,
  adminOverviewQueryOptions,
  adminSkillsQueryOptions,
  adminTimeseriesQueryOptions,
  adminToolsQueryOptions,
  adminUsersQueryOptions,
} from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

type StatCardProps = { label: string; value: string };

function StatCard({ label, value }: StatCardProps) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-wrap text-sm font-medium leading-snug text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="break-words text-xl font-bold sm:text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(duration: number): string {
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

function usd(cost: number): string {
  if (cost === 0) return '—';
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  return `$${cost.toFixed(3)}`;
}

function formatBucketLabel(bucketStart: string): string {
  const d = new Date(bucketStart);
  if (Number.isNaN(d.getTime())) return bucketStart;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return hh === '00' ? `${mm}/${dd}` : `${mm}/${dd} ${hh}:00`;
}

// ── Time-series charts ────────────────────────────────────────────────────────

const CHART_HEIGHT = 200;

type TimeSeriesBucket = {
  bucketStart: string;
  requestCount: number;
  errorCount: number;
  cancelledCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCallCount: number;
  toolFailureCount: number;
};

type TimeSeriesSectionProps = {
  buckets: TimeSeriesBucket[];
};

const requestConfig: ChartConfig = {
  requestCount: { label: 'Requests', color: 'var(--chart-1)' },
};

const durationConfig: ChartConfig = {
  avgDurationMs: { label: 'Avg', color: 'var(--chart-2)' },
  p95DurationMs: { label: 'P95', color: 'var(--chart-4)' },
};

const errorConfig: ChartConfig = {
  errorRate: { label: 'Error', color: 'var(--destructive)' },
  cancelledRate: { label: 'Cancelled', color: 'var(--chart-3)' },
  toolFailureRate: { label: 'Tool Failure', color: 'var(--chart-5)' },
};

const tokenConfig: ChartConfig = {
  inputTokens: { label: 'Input', color: 'var(--chart-2)' },
  outputTokens: { label: 'Output', color: 'var(--chart-4)' },
};

function TimeSeriesSection({ buckets }: TimeSeriesSectionProps) {
  const enriched = buckets.map((b) => ({
    ...b,
    label: formatBucketLabel(b.bucketStart),
    errorRate: b.requestCount > 0 ? (b.errorCount / b.requestCount) * 100 : 0,
    cancelledRate: b.requestCount > 0 ? (b.cancelledCount / b.requestCount) * 100 : 0,
    toolFailureRate:
      b.toolCallCount > 0 ? (b.toolFailureCount / b.toolCallCount) * 100 : 0,
  }));

  const isEmpty = enriched.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <ChartEmptyState />
          ) : (
            <ChartContainer config={requestConfig}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={enriched}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={<ChartTooltipContent />}
                    cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="requestCount"
                    name="Requests"
                    stroke="var(--color-requestCount)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Latency</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <ChartEmptyState />
          ) : (
            <ChartContainer config={durationConfig}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={enriched}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => ms(v)} />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v, name) => `${ms(Number(v))} (${name})`}
                      />
                    }
                    cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgDurationMs"
                    name="Avg"
                    stroke="var(--color-avgDurationMs)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p95DurationMs"
                    name="P95"
                    stroke="var(--color-p95DurationMs)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 2"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Error / Failure Rate</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <ChartEmptyState />
          ) : (
            <ChartContainer config={errorConfig}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={enriched}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v) => `${Number(v).toFixed(1)}%`}
                      />
                    }
                    cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="errorRate"
                    name="Error"
                    stroke="var(--color-errorRate)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cancelledRate"
                    name="Cancelled"
                    stroke="var(--color-cancelledRate)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 2"
                  />
                  <Line
                    type="monotone"
                    dataKey="toolFailureRate"
                    name="Tool Failure"
                    stroke="var(--color-toolFailureRate)"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="2 2"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <ChartEmptyState />
          ) : (
            <ChartContainer config={tokenConfig}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={enriched}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={<ChartTooltipContent />}
                    cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="inputTokens"
                    name="Input"
                    stroke="var(--color-inputTokens)"
                    fill="var(--color-inputTokens)"
                    fillOpacity={0.2}
                    stackId="tokens"
                  />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    name="Output"
                    stroke="var(--color-outputTokens)"
                    fill="var(--color-outputTokens)"
                    fillOpacity={0.2}
                    stackId="tokens"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Ranking charts ────────────────────────────────────────────────────────────

const TOP_N = 5;
const RANKING_HEIGHT = 180;

const rankingConfig: ChartConfig = {
  value: { label: 'Count', color: 'var(--chart-1)' },
};

type RankingEntry = { name: string; value: number };

function RankingChart({ title, data }: { title: string; data: RankingEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState />
        ) : (
          <ChartContainer config={rankingConfig}>
            <ResponsiveContainer width="100%" height={RANKING_HEIGHT}>
              <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="var(--border)"
                />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={80}
                  tickFormatter={(v: string) =>
                    v.length > 12 ? `${v.slice(0, 12)}…` : v
                  }
                />
                <Tooltip
                  content={<ChartTooltipContent />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                />
                <Bar
                  dataKey="value"
                  name="Count"
                  fill="var(--color-value)"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OverviewTab({ from, to }: Props) {
  const dateRange = { from, to };

  const { data, isLoading, error } = useQuery(adminOverviewQueryOptions(dateRange));
  const { data: tsData } = useQuery(
    adminTimeseriesQueryOptions({ ...dateRange, bucket: 'day' }),
  );
  const { data: agentsData } = useQuery(adminAgentsQueryOptions(dateRange));
  const { data: toolsData } = useQuery(adminToolsQueryOptions(dateRange));
  const { data: skillsData } = useQuery(adminSkillsQueryOptions(dateRange));
  const { data: usersData } = useQuery(adminUsersQueryOptions(dateRange));

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading overview...</div>;
  }

  if (error || !data) {
    return <div className="text-destructive text-sm">Failed to load overview.</div>;
  }

  const topAgents: RankingEntry[] = [...(agentsData?.agents ?? [])]
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, TOP_N)
    .map((a) => ({ name: a.agentName, value: a.callCount }));

  const topTools: RankingEntry[] = [...(toolsData?.tools ?? [])]
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, TOP_N)
    .map((t) => ({ name: t.toolName, value: t.callCount }));

  const topSkills: RankingEntry[] = [...(skillsData?.skills ?? [])]
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, TOP_N)
    .map((s) => ({ name: s.skillName, value: s.requestCount }));

  const topUsers: RankingEntry[] = [...(usersData?.users ?? [])]
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, TOP_N)
    .map((u) => ({ name: u.userId, value: u.requestCount }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Requests" value={String(data.requestCount)} />
        <StatCard label="Active Users" value={String(data.activeUserCount)} />
        <StatCard label="Total Tokens" value={data.totalTokens.toLocaleString()} />
        <StatCard label="Avg Duration" value={ms(data.avgDurationMs)} />
        <StatCard label="P95 Duration" value={ms(data.p95DurationMs)} />
        <StatCard label="Error Rate" value={pct(data.errorRate)} />
        <StatCard label="Tool Calls" value={String(data.totalToolCalls)} />
        <StatCard label="Tool Failure Rate" value={pct(data.toolFailureRate)} />
        <StatCard label="Est. Cost" value={usd(data.estimatedCostUsd)} />
      </div>

      <TimeSeriesSection buckets={tsData?.buckets ?? []} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankingChart title="Top Agents by Calls" data={topAgents} />
        <RankingChart title="Top Tools by Calls" data={topTools} />
        <RankingChart title="Top Skills by Requests" data={topSkills} />
        <RankingChart title="Top Users by Requests" data={topUsers} />
      </div>
    </div>
  );
}
