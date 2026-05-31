'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { formatTraceStatus } from '@/lib/admin-labels';
import type { AdminTraceListItem } from '@/lib/generated/model';
import { adminTracesQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';

type Props = {
  from: string;
  to: string;
  onSelectTrace: (traceId: string) => void;
  initialUserId?: string;
};

function statusVariant(status: string): 'success' | 'destructive' | 'secondary' {
  if (status === 'success') return 'success';
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
    header: 'ユーザー',
    size: 130,
    enableSorting: false,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('startedAt', {
    header: '開始日時',
    size: 160,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(getValue<string>()).toLocaleString()}
      </span>
    ),
  }),
  helper.accessor('durationMs', {
    header: '所要時間',
    size: 100,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
    meta: { align: 'right' },
  }),
  helper.accessor('status', {
    header: '状態',
    size: 100,
    cell: ({ getValue }) => {
      const s = getValue<string>();
      return <Badge variant={statusVariant(s)}>{formatTraceStatus(s)}</Badge>;
    },
  }),
  helper.accessor('totalTokens', {
    header: 'トークン',
    size: 90,
    cell: ({ getValue }) => getValue<number | undefined>()?.toLocaleString() ?? '—',
    meta: { align: 'right' },
  }),
  helper.accessor('toolCallCount', {
    header: 'ツール',
    size: 70,
    meta: { align: 'right' },
  }),
  helper.accessor('agentCallCount', {
    header: 'エージェント',
    size: 70,
    meta: { align: 'right' },
  }),
  helper.accessor('skillCallCount', {
    header: 'スキル',
    size: 70,
    meta: { align: 'right' },
  }),
];

function filterTraces(traces: AdminTraceListItem[], query: string): AdminTraceListItem[] {
  if (!query) return traces;
  const q = query.toLowerCase();
  return traces.filter(
    (t) => t.traceId.toLowerCase().includes(q) || t.userId.toLowerCase().includes(q),
  );
}

export function TracesTab({ from, to, onSelectTrace, initialUserId = '' }: Props) {
  const [statusFilter, setStatusFilter] = useState('');
  const [appliedUserId, setAppliedUserId] = useState(initialUserId);
  const [traceSearch, setTraceSearch] = useState(initialUserId);

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

  function handleTraceSearchChange(v: string) {
    setTraceSearch(v);
    if (v === '') {
      setAppliedUserId('');
      setAllTraces([]);
      setCursor(undefined);
    }
  }

  function handleTraceSearchEnter() {
    setAppliedUserId(traceSearch);
    setAllTraces([]);
    setCursor(undefined);
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
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="">すべての状態</option>
          <option value="success">成功</option>
          <option value="error">エラー</option>
          <option value="cancelled">キャンセル</option>
        </select>
        <SearchToolbar
          value={traceSearch}
          onChange={handleTraceSearchChange}
          onEnter={handleTraceSearchEnter}
          placeholder="Trace ID または User ID で検索..."
          className="w-full sm:w-64"
        />
      </div>

      <DataTable
        data={filteredTraces}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'トレースの読み込みに失敗しました。' : null}
        emptyMessage={
          traceSearch
            ? '検索に一致するトレースはありません。'
            : 'この期間のデータはありません。'
        }
        onRowClick={(t) => onSelectTrace(t.traceId)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}-${statusFilter}-${appliedUserId}`}
      />

      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            さらに読み込む
          </Button>
        </div>
      )}
    </div>
  );
}
