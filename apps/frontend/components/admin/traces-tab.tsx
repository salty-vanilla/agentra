'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminTraceListItem } from '@/lib/generated/model';
import { adminTracesQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
  onSelectTrace: (traceId: string) => void;
};

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'success') return 'default';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

export function TracesTab({ from, to, onSelectTrace }: Props) {
  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allTraces, setAllTraces] = useState<AdminTraceListItem[]>([]);

  const params = {
    from,
    to,
    limit: 50,
    ...(cursor !== undefined ? { cursor } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(userIdFilter ? { userId: userIdFilter } : {}),
  };

  const { data, isLoading, error } = useQuery({
    ...adminTracesQueryOptions(params),
    placeholderData: (prev) => prev,
  });

  const traces =
    cursor === undefined ? (data?.traces ?? []) : [...allTraces, ...(data?.traces ?? [])];

  function applyFilter() {
    setAllTraces([]);
    setCursor(undefined);
  }

  function loadMore() {
    if (data?.cursor) {
      setAllTraces(traces);
      setCursor(data.cursor);
    }
  }

  if (isLoading && !cursor) {
    return <div className="text-muted-foreground text-sm">Loading traces...</div>;
  }

  if (error) {
    return <div className="text-destructive text-sm">Failed to load traces.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="h-8 rounded border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
        </select>
        <Input
          placeholder="Filter by user ID..."
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          className="h-8 w-52 text-sm"
        />
        <Button variant="outline" size="sm" onClick={applyFilter}>
          Apply
        </Button>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {[
                'Trace ID',
                'User',
                'Started',
                'Duration',
                'Status',
                'Tokens',
                'Tools',
                'Agents',
                'Skills',
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr
                key={t.traceId}
                className="border-t hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelectTrace(t.traceId)}
              >
                <td className="px-3 py-2 font-mono text-xs">{t.traceId.slice(0, 12)}…</td>
                <td className="px-3 py-2 font-mono text-xs">{t.userId.slice(0, 12)}…</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(t.startedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">{t.durationMs}ms</td>
                <td className="px-3 py-2">
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                </td>
                <td className="px-3 py-2">{t.totalTokens?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-2">{t.toolCallCount}</td>
                <td className="px-3 py-2">{t.agentCallCount}</td>
                <td className="px-3 py-2">{t.skillCallCount}</td>
              </tr>
            ))}
            {traces.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No data for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.cursor && (
        <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
          Load more
        </Button>
      )}
    </div>
  );
}
