'use client';

import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import type { AdminUser } from '@/lib/api';
import { adminUsersListQueryOptions } from '@/lib/query-options';
import { AdminUserDetailDrawer } from './admin-user-detail-drawer';
import { SearchToolbar } from './search-toolbar';

const ROLE_OPTIONS = ['All', 'Admin', 'User'] as const;
type RoleFilter = (typeof ROLE_OPTIONS)[number];

const helper = createColumnHelper<AdminUser>();

const columns = [
  helper.accessor('email', {
    header: 'Email',
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
    header: 'Role',
    size: 90,
    cell: ({ getValue }) => {
      const role = getValue<'admin' | 'user'>();
      return (
        <Badge variant={role === 'admin' ? 'default' : 'secondary'}>
          {role === 'admin' ? 'Admin' : 'User'}
        </Badge>
      );
    },
  }),
  helper.accessor('createdAt', {
    header: 'Created',
    size: 160,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(getValue<string>()).toLocaleDateString()}
      </span>
    ),
  }),
  helper.accessor('lastSeenAt', {
    header: 'Last Seen',
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
    header: 'Requests',
    size: 90,
    cell: ({ getValue }) => getValue<number | undefined>()?.toLocaleString() ?? '—',
  }),
];

function filterUsers(users: AdminUser[], search: string, role: RoleFilter): AdminUser[] {
  let result = users;
  if (role !== 'All') {
    const targetRole = role.toLowerCase() as 'admin' | 'user';
    result = result.filter((u) => u.role === targetRole);
  }
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q) ||
        u.sub.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }
  return result;
}

export function AdminUsersPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [selected, setSelected] = useState<AdminUser | null>(null);

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
        <h1 className="text-xl font-semibold">Users</h1>
      </div>

      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <SearchToolbar
          value={search}
          onChange={setSearch}
          placeholder="Search by email, user ID, sub, or role..."
          className="w-80"
        />
        <div className="flex gap-1">
          {ROLE_OPTIONS.map((opt) => (
            <Button
              key={opt}
              variant={roleFilter === opt ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRoleFilter(opt)}
            >
              {opt}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Usage stats: last 30 days
        </span>
      </div>

      <DataTable
        data={filteredUsers}
        columns={columns}
        isLoading={isLoading}
        error={error ? 'Failed to load users.' : null}
        emptyMessage={
          search || roleFilter !== 'All'
            ? 'No users match the filter.'
            : 'No users found.'
        }
        onRowClick={(user) => setSelected(user)}
        virtualized
        height="100%"
      />

      {data?.cursor && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isLoading}>
            Load more
          </Button>
        </div>
      )}

      <AdminUserDetailDrawer user={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
