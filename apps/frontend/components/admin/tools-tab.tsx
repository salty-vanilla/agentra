'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import type { AdminToolStats } from '@/lib/generated/model';
import { adminToolsQueryOptions } from '@/lib/query-options';

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

export function ToolsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminToolsQueryOptions({ from, to }));

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <DataTable
        data={data?.tools ?? []}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load tools.' : null}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
    </div>
  );
}
