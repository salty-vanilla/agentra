'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import type { AdminSkillStats } from '@/lib/generated/model';
import { adminSkillsQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';
import { SkillDetailDrawer } from './skill-detail-drawer';

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

function filterSkills(skills: AdminSkillStats[], query: string): AdminSkillStats[] {
  if (!query) return skills;
  const q = query.toLowerCase();
  return skills.filter((s) => s.skillName.toLowerCase().includes(q));
}

export function SkillsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminSkillsQueryOptions({ from, to }));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminSkillStats | null>(null);

  const filteredSkills = useMemo(
    () => filterSkills(data?.skills ?? [], search),
    [data?.skills, search],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by skill name..."
          className="w-full sm:w-72"
        />
      </div>
      <DataTable
        data={filteredSkills}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load skills.' : null}
        emptyMessage={search ? 'No skills match the search.' : 'No data for this period.'}
        onRowClick={(skill) => setSelected(skill)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      <SkillDetailDrawer skill={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
