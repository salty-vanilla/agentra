'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import type { AdminToolStats } from '@/lib/generated/model';
import { adminToolsQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';
import { ToolDetailDrawer } from './tool-detail-drawer';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminToolStats>();

const columns = [
  helper.accessor('toolName', { header: 'Tool', size: 180 }),
  helper.accessor('callCount', { header: 'Calls', size: 80 }),
  helper.accessor('failureRate', {
    header: 'Failure Rate',
    size: 110,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
  helper.accessor('avgDurationMs', {
    header: 'Avg Duration',
    size: 110,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('lastError', {
    header: 'Last Error',
    size: 250,
    enableSorting: false,
    cell: ({ getValue }) => {
      const err = getValue<string | undefined>();
      return <span className="text-xs text-muted-foreground truncate">{err ?? '—'}</span>;
    },
  }),
];

function filterTools(tools: AdminToolStats[], query: string): AdminToolStats[] {
  if (!query) return tools;
  const q = query.toLowerCase();
  return tools.filter(
    (t) =>
      t.toolName.toLowerCase().includes(q) ||
      (t.lastError?.toLowerCase().includes(q) ?? false),
  );
}

export function ToolsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminToolsQueryOptions({ from, to }));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminToolStats | null>(null);

  const filteredTools = useMemo(
    () => filterTools(data?.tools ?? [], search),
    [data?.tools, search],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by tool name or last error..."
          className="w-72"
        />
      </div>
      <DataTable
        data={filteredTools}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load tools.' : null}
        emptyMessage={search ? 'No tools match the search.' : 'No data for this period.'}
        onRowClick={(tool) => setSelected(tool)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      <ToolDetailDrawer tool={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
