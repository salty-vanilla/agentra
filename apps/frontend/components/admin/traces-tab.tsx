'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import type { AdminTraceListItem } from '@/lib/generated/model';
import { adminTracesQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';

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

const helper = createColumnHelper<AdminTraceListItem>();

const columns = [
  helper.accessor('traceId', {
    header: 'Trace ID',
    size: 140,
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('userId', {
    header: 'User',
    size: 130,
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('startedAt', {
    header: 'Started',
    size: 160,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(getValue<string>()).toLocaleString()}
      </span>
    ),
  }),
  helper.accessor('durationMs', {
    header: 'Duration',
    size: 100,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('status', {
    header: 'Status',
    size: 100,
    cell: ({ getValue }) => {
      const s = getValue<string>();
      return <Badge variant={statusVariant(s)}>{s}</Badge>;
    },
  }),
  helper.accessor('totalTokens', {
    header: 'Tokens',
    size: 90,
    cell: ({ getValue }) => getValue<number | undefined>()?.toLocaleString() ?? '—',
  }),
  helper.accessor('toolCallCount', { header: 'Tools', size: 70 }),
  helper.accessor('agentCallCount', { header: 'Agents', size: 70 }),
  helper.accessor('skillCallCount', { header: 'Skills', size: 70 }),
];

function filterTraces(traces: AdminTraceListItem[], query: string): AdminTraceListItem[] {
  if (!query) return traces;
  const q = query.toLowerCase();
  return traces.filter(
    (t) => t.traceId.toLowerCase().includes(q) || t.userId.toLowerCase().includes(q),
  );
}

export function TracesTab({ from, to, onSelectTrace }: Props) {
  const [statusFilter, setStatusFilter] = useState('');
  const [draftUserId, setDraftUserId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [traceSearch, setTraceSearch] = useState('');

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allTraces, setAllTraces] = useState<AdminTraceListItem[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: from/to are intentional triggers — period change resets pagination
  useEffect(() => {
    setCursor(undefined);
    setAllTraces([]);
  }, [from, to]);

  const params = {
    from,
    to,
    limit: 50,
    ...(cursor !== undefined ? { cursor } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(appliedUserId ? { userId: appliedUserId } : {}),
  };

  const { data, isLoading, error } = useQuery({
    ...adminTracesQueryOptions(params),
    placeholderData: (prev) => prev,
  });

  const traces = useMemo(
    () => [...allTraces, ...(data?.traces ?? [])],
    [allTraces, data?.traces],
  );

  const filteredTraces = useMemo(
    () => filterTraces(traces, traceSearch),
    [traces, traceSearch],
  );

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setAllTraces([]);
    setCursor(undefined);
  }

  function applyUserIdFilter() {
    setAppliedUserId(draftUserId);
    setAllTraces([]);
    setCursor(undefined);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') applyUserIdFilter();
  }

  function loadMore() {
    if (data?.cursor) {
      setAllTraces((prev) => [...prev, ...(data?.traces ?? [])]);
      setCursor(data.cursor);
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <select
          className="h-8 rounded border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Input
          placeholder="Search by trace ID or user ID..."
          value={draftUserId}
          onChange={(e) => setDraftUserId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 w-52 text-sm"
        />
        <Button variant="outline" size="sm" onClick={applyUserIdFilter}>
          Apply
        </Button>
        <SearchToolbar
          value={traceSearch}
          onChange={setTraceSearch}
          placeholder="Filter loaded rows..."
          className="w-48"
        />
      </div>

      <DataTable
        data={filteredTraces}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load traces.' : null}
        emptyMessage={
          traceSearch ? 'No traces match the search.' : 'No data for this period.'
        }
        onRowClick={(t) => onSelectTrace(t.traceId)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}-${statusFilter}-${appliedUserId}`}
      />

      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
