'use client';

import type { CSSProperties, ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

type AdminShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
};

export function AdminShell({ children, sidebar = <AdminSidebar /> }: AdminShellProps) {
  return (
    <SidebarProvider defaultOpen style={{ '--sidebar-width': '14rem' } as CSSProperties}>
      <div className="flex h-svh w-full overflow-hidden bg-background">
        {sidebar}

        <SidebarInset className="min-w-0 bg-background">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 md:hidden">
            <SidebarTrigger aria-label="Open admin navigation" className="-ml-1" />
            <span className="truncate font-semibold text-sm">Admin Console</span>
          </header>

          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
