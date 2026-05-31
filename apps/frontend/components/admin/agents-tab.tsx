'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import type { AdminAgentStats } from '@/lib/generated/model';
import { adminAgentsQueryOptions } from '@/lib/query-options';
import { AgentDetailDrawer } from './agent-detail-drawer';
import { SearchToolbar } from './search-toolbar';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminAgentStats>();

const columns = [
  helper.accessor('agentName', { header: 'エージェント', size: 180 }),
  helper.accessor('callCount', { header: '呼び出し', size: 80 }),
  helper.accessor('successRate', {
    header: '成功率',
    size: 110,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
  helper.accessor('errorRate', {
    header: 'エラー率',
    size: 100,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
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
  helper.accessor('relatedTools', {
    header: '関連ツール',
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

function filterAgents(agents: AdminAgentStats[], query: string): AdminAgentStats[] {
  if (!query) return agents;
  const q = query.toLowerCase();
  return agents.filter(
    (a) =>
      a.agentName.toLowerCase().includes(q) ||
      a.relatedTools.join(' ').toLowerCase().includes(q),
  );
}

export function AgentsTab({ from, to }: Props) {
  const { data, isLoading, error } = useQuery(adminAgentsQueryOptions({ from, to }));
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminAgentStats | null>(null);

  const filteredAgents = useMemo(
    () => filterAgents(data?.agents ?? [], search),
    [data?.agents, search],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="エージェント名または関連ツールで検索..."
          className="w-full sm:w-72"
        />
      </div>
      <DataTable
        data={filteredAgents}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'エージェントの読み込みに失敗しました。' : null}
        emptyMessage={
          search
            ? '検索に一致するエージェントはいません。'
            : 'この期間のデータはありません。'
        }
        onRowClick={(agent) => setSelected(agent)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      <AgentDetailDrawer agent={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
