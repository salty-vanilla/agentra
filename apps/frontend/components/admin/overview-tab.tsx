'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminOverviewQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function usd(cost: number): string {
  if (cost === 0) return '—';
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  return `$${cost.toFixed(3)}`;
}

export function OverviewTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminOverviewQueryOptions({ from, to }));

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading overview...</div>;
  }

  if (error || !data) {
    return <div className="text-destructive text-sm">Failed to load overview.</div>;
  }

  return (
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
  );
}
