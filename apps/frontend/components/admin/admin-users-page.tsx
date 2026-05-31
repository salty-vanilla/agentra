'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { formatAdminRole, formatUserEnabled } from '@/lib/admin-labels';
import type { AdminUser } from '@/lib/api';
import { adminUsersListQueryOptions } from '@/lib/query-options';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';
import { AdminUserInviteDialog } from './admin-user-invite-dialog';
import { SearchToolbar } from './search-toolbar';

const ROLE_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'admin', label: '管理者' },
  { value: 'user', label: '一般ユーザー' },
] as const;
type RoleFilter = (typeof ROLE_OPTIONS)[number]['value'];

const helper = createColumnHelper<AdminUser>();

const columns = [
  helper.accessor('email', {
    header: 'メールアドレス',
    size: 220,
  }),
  helper.accessor('userId', {
    header: 'User ID',
    size: 160,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('sub', {
    header: 'Sub',
    size: 160,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>().slice(0, 16)}…</span>
    ),
  }),
  helper.accessor('role', {
    header: 'ロール',
    size: 90,
    cell: ({ getValue }) => {
      const role = getValue<'admin' | 'user'>();
      return (
        <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
          {formatAdminRole(role)}
        </Badge>
      );
    },
  }),
  helper.accessor('enabled', {
    header: '状態',
    size: 100,
    cell: ({ getValue }) => {
      const enabled = getValue<boolean>();
      return (
        <Badge variant={enabled ? 'success' : 'destructive'}>
          {formatUserEnabled(enabled)}
        </Badge>
      );
    },
  }),
  helper.accessor('createdAt', {
    header: '作成日',
    size: 160,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(getValue<string>()).toLocaleDateString()}
      </span>
    ),
  }),
  helper.accessor('lastSeenAt', {
    header: '最終利用',
    size: 160,
    cell: ({ getValue }) => {
      const v = getValue<string | undefined>();
      return v ? (
        <span className="text-xs text-muted-foreground">
          {new Date(v).toLocaleDateString()}
        </span>
      ) : (
        '—'
      );
    },
  }),
  helper.accessor('requestCount', {
    header: 'リクエスト',
    size: 90,
    cell: ({ getValue }) => getValue<number | undefined>()?.toLocaleString() ?? '—',
    meta: { align: 'right' },
  }),
];

function filterUsers(users: AdminUser[], search: string, role: RoleFilter): AdminUser[] {
  let result = users;
  if (role !== 'all') {
    result = result.filter((u) => u.role === role);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q) ||
        u.sub.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        formatAdminRole(u.role).toLowerCase().includes(q),
    );
  }
  return result;
}

export function AdminUsersPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    ...adminUsersListQueryOptions({
      limit: 50,
      ...(cursor !== undefined ? { cursor } : {}),
    }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    setCursor(undefined);
    setAllUsers([]);
  }, []);

  const users = useMemo(
    () => [...allUsers, ...(data?.users ?? [])],
    [allUsers, data?.users],
  );

  const filteredUsers = useMemo(
    () => filterUsers(users, search, roleFilter),
    [users, search, roleFilter],
  );

  function loadMore() {
    if (data?.cursor) {
      setAllUsers((prev) => [...prev, ...(data?.users ?? [])]);
      setCursor(data.cursor);
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">ユーザー</h1>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          ユーザーを招待
        </Button>
      </div>

      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="メールアドレス、User ID、Sub、ロールで検索..."
          className="w-full sm:w-80"
        />
        <div className="flex flex-wrap gap-1">
          {ROLE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={roleFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          利用統計: 過去30日
        </span>
      </div>

      <DataTable
        data={filteredUsers}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'ユーザーの読み込みに失敗しました。' : null}
        emptyMessage={
          search || roleFilter !== 'all'
            ? '条件に一致するユーザーはいません。'
            : 'ユーザーが見つかりません。'
        }
        onRowClick={(user) => setSelected(user)}
        virtualized
        height="100%"
      />

      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            さらに読み込む
          </Button>
        </div>
      )}

      <AdminUserDetailDrawer
        user={selected}
        onClose={() => setSelected(null)}
        onUserUpdated={(updated) => {
          setSelected(updated);
          setAllUsers((prev) => prev.map((u) => (u.sub === updated.sub ? updated : u)));
        }}
      />
      <AdminUserInviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => {
          setCursor(undefined);
          setAllUsers([]);
        }}
      />
    </div>
  );
}
