'use client';

import { BarChart3, BookOpen, Bot, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  enabled: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Observability',
    href: '/admin/observability',
    icon: BarChart3,
    enabled: true,
  },
  { label: 'Users', href: '/admin/users', icon: Users, enabled: false },
  { label: 'Agents', href: '/admin/agents', icon: Bot, enabled: false },
  { label: 'RAG / KB', href: '/admin/rag', icon: BookOpen, enabled: false },
  { label: 'Settings', href: '/admin/settings', icon: Settings, enabled: false },
];

function AdminNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <span
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
        active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground',
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

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r flex flex-col gap-0.5 p-3">
      <Link
        href="/admin"
        className="px-3 py-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        Admin Console
      </Link>
      {NAV_ITEMS.map((item) => (
        <AdminNavItem
          key={item.href}
          item={item}
          active={pathname.startsWith(item.href)}
        />
      ))}
    </aside>
  );
}
