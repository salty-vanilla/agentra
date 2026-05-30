'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, Bot, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAdminConsoleActive, isNavItemActive } from '@/lib/admin-routes';
import { kbStatusQueryOptions } from '@/lib/query-options';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  enabled: boolean;
}

const STATIC_NAV_ITEMS: NavItem[] = [
  {
    label: 'Observability',
    href: '/admin/observability',
    icon: BarChart3,
    enabled: true,
  },
  { label: 'Users', href: '/admin/users', icon: Users, enabled: true },
  { label: 'Agents', href: '/admin/agents', icon: Bot, enabled: false },
  { label: 'RAG / KB', href: '/admin/rag', icon: BookOpen, enabled: false },
  { label: 'Settings', href: '/admin/settings', icon: Settings, enabled: false },
];

function useNavItems(): NavItem[] {
  const { data } = useQuery({ ...kbStatusQueryOptions(), retry: false });
  const kbEnabled = data?.configured ?? false;
  return STATIC_NAV_ITEMS.map((item) =>
    item.href === '/admin/rag' ? { ...item, enabled: kbEnabled } : item,
  );
}

function AdminNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <span
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground',
        item.enabled
          ? 'hover:bg-muted hover:text-foreground cursor-pointer'
          : 'opacity-50 cursor-not-allowed',
      )}
      {...(!item.enabled && { 'aria-disabled': true })}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </span>
  );

  if (!item.enabled) return content;

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  );
}

export interface AdminSidebarViewProps {
  currentPath: string;
  navItems?: NavItem[];
}

export function AdminSidebarView({
  currentPath,
  navItems = STATIC_NAV_ITEMS,
}: AdminSidebarViewProps) {
  const consoleActive = isAdminConsoleActive(currentPath);

  return (
    <aside className="w-56 shrink-0 border-r flex flex-col gap-0.5 p-3">
      <Link
        href="/admin"
        className={cn(
          'mb-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
          consoleActive
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Admin Console
      </Link>
      {navItems.map((item) => (
        <AdminNavItem
          key={item.href}
          item={item}
          active={isNavItemActive(currentPath, item.href)}
        />
      ))}
    </aside>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const navItems = useNavItems();
  return <AdminSidebarView currentPath={pathname} navItems={navItems} />;
}
