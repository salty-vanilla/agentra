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
  helper.accessor('skillName', { header: 'スキル', size: 180 }),
  helper.accessor('requestCount', { header: 'リクエスト', size: 100 }),
  helper.accessor('avgDurationMs', {
    header: '平均時間',
    size: 110,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('totalTokens', {
    header: 'トークン',
    size: 100,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  }),
  helper.accessor('errorRate', {
    header: 'エラー率',
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
          placeholder="スキル名で検索..."
          className="w-full sm:w-72"
        />
      </div>
      <DataTable
        data={filteredSkills}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'スキルの読み込みに失敗しました。' : null}
        emptyMessage={
          search ? '検索に一致するスキルはありません。' : 'この期間のデータはありません。'
        }
        onRowClick={(skill) => setSelected(skill)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      <SkillDetailDrawer skill={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
