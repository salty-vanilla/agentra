'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
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

export function TracesTab({ from, to, onSelectTrace }: Props) {
  const [statusFilter, setStatusFilter] = useState('');
  const [draftUserId, setDraftUserId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');

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

  const traces =
    cursor === undefined ? (data?.traces ?? []) : [...allTraces, ...(data?.traces ?? [])];

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
      setAllTraces(traces);
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
      </div>

      <DataTable
        data={traces}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load traces.' : null}
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
