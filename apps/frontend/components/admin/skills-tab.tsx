'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import type { AdminSkillStats } from '@/lib/generated/model';
import { adminSkillsQueryOptions } from '@/lib/query-options';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminSkillStats>();

const columns = [
  helper.accessor('skillName', { header: 'Skill', size: 180 }),
  helper.accessor('requestCount', { header: 'Requests', size: 100 }),
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
  helper.accessor('errorRate', {
    header: 'Error Rate',
    size: 100,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
];

export function SkillsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminSkillsQueryOptions({ from, to }));

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <DataTable
        data={data?.skills ?? []}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load skills.' : null}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
    </div>
  );
}
