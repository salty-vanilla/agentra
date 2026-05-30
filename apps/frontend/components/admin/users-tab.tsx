'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { formatAdminRole } from '@/lib/admin-labels';
import type { AdminUserStats } from '@/lib/generated/model';
import { adminUsersQueryOptions } from '@/lib/query-options';
import { SearchToolbar } from './search-toolbar';
import { UserDetailDrawer } from './user-detail-drawer';

type Props = {
  from: string;
  to: string;
};

const helper = createColumnHelper<AdminUserStats>();

const columns = [
  helper.accessor('userId', {
    header: 'User ID',
    size: 200,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('role', {
    header: 'ロール',
    size: 90,
    cell: ({ getValue }) => {
      const role = getValue<'admin' | 'user' | undefined>() ?? 'user';
      return (
        <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
          {formatAdminRole(role)}
        </Badge>
      );
    },
  }),
  helper.accessor('requestCount', { header: 'リクエスト', size: 100 }),
  helper.accessor('totalTokens', {
    header: 'トークン',
    size: 120,
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  }),
  helper.accessor('avgDurationMs', {
    header: '平均時間',
    size: 120,
    cell: ({ getValue }) => `${getValue<number>()}ms`,
  }),
  helper.accessor('errorRate', {
    header: 'エラー率',
    size: 100,
    cell: ({ getValue }) => `${(getValue<number>() * 100).toFixed(1)}%`,
  }),
  helper.accessor('mostUsedAgent', {
    header: '上位エージェント',
    size: 150,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '—',
  }),
  helper.accessor('mostUsedTool', {
    header: '上位ツール',
    size: 150,
    cell: ({ getValue }) => getValue<string | undefined>() ?? '—',
  }),
];

function filterUsers(users: AdminUserStats[], query: string): AdminUserStats[] {
  if (!query) return users;
  const q = query.toLowerCase();
  return users.filter(
    (u) =>
      u.userId.toLowerCase().includes(q) ||
      (u.role ?? 'user').toLowerCase().includes(q) ||
      formatAdminRole(u.role ?? 'user')
        .toLowerCase()
        .includes(q) ||
      (u.mostUsedAgent?.toLowerCase().includes(q) ?? false) ||
      (u.mostUsedTool?.toLowerCase().includes(q) ?? false),
  );
}

export function UsersTab({ from, to }: Props) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUserStats[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUserStats | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: from/to are intentional triggers — period change resets pagination
  useEffect(() => {
    setCursor(undefined);
    setAllUsers([]);
  }, [from, to]);

  const { data, isLoading, error } = useQuery({
    ...adminUsersQueryOptions({
      from,
      to,
      limit: 50,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
    placeholderData: (prev) => prev,
  });

  const users = useMemo(
    () => [...allUsers, ...(data?.users ?? [])],
    [allUsers, data?.users],
  );

  const filteredUsers = useMemo(() => filterUsers(users, search), [users, search]);

  function loadMore() {
    if (data?.cursor) {
      setAllUsers((prev) => [...prev, ...(data?.users ?? [])]);
      setCursor(data.cursor);
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="User ID、ロール、上位エージェント、上位ツールで検索..."
          className="w-full sm:w-72"
        />
      </div>
      <DataTable
        data={filteredUsers}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'ユーザーの読み込みに失敗しました。' : null}
        emptyMessage={
          search ? '検索に一致するユーザーはいません。' : 'この期間のデータはありません。'
        }
        onRowClick={(user) => setSelected(user)}
        virtualized
        height="100%"
        resetSortingKey={`${from}-${to}`}
      />
      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            さらに読み込む
          </Button>
        </div>
      )}
      <UserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
