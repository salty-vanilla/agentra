'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import type { AdminAgentStats } from '@/lib/generated/model';
import { adminAgentsQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminAgentStats>();

const columns = [
  helper.accessor('agentName', { header: 'Agent', size: 180 }),
  helper.accessor('callCount', { header: 'Calls', size: 80 }),
  helper.accessor('successRate', {
    header: 'Success Rate',
    size: 110,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
  helper.accessor('errorRate', {
    header: 'Error Rate',
    size: 100,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
  helper.accessor('avgDurationMs', {
    header: 'Avg Duration',
    size: 110,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('totalTokens', {
    header: 'Tokens',
    size: 100,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  }),
  helper.accessor('relatedTools', {
    header: 'Related Tools',
    size: 200,
    enableSorting: false,
    cell: ({ getValue }) => {
      const tools = getValue<string[]>();
      return (
        <span className="text-xs text-muted-foreground">{tools.join(', ') || '—'}</span>
      );
    },
  }),
];

export function AgentsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminAgentsQueryOptions({ from, to }));

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <DataTable
        data={data?.agents ?? []}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load agents.' : null}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
    </div>
  );
}
