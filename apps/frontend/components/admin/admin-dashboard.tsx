'use client';

import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AgentsTab } from '@/components/admin/agents-tab';
import { OverviewTab } from '@/components/admin/overview-tab';
import type { Period } from '@/components/admin/period-filter';
import { PeriodFilter } from '@/components/admin/period-filter';
import { SkillsTab } from '@/components/admin/skills-tab';
import { ToolsTab } from '@/components/admin/tools-tab';
import { TraceDetailDrawer } from '@/components/admin/trace-detail-drawer';
import { TracesTab } from '@/components/admin/traces-tab';
import { UsersTab } from '@/components/admin/users-tab';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VALID_TABS = new Set(['overview', 'users', 'agents', 'tools', 'skills', 'traces']);

const TAB_ITEMS = [
  { value: 'overview', label: '概要' },
  { value: 'users', label: 'ユーザー' },
  { value: 'agents', label: 'エージェント' },
  { value: 'tools', label: 'ツール' },
  { value: 'skills', label: 'スキル' },
  { value: 'traces', label: 'トレース' },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]['value'];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminDashboard() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'overview';
  const initialUserId = searchParams.get('userId') ?? '';

  const today = todayStr();
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [activeTab, setActiveTab] = useState<TabValue>(
    VALID_TABS.has(initialTab) ? (initialTab as TabValue) : 'overview',
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  function handlePeriodChange(p: Period, nextFrom: string, nextTo: string) {
    setPeriod(p);
    setFrom(nextFrom);
    setTo(nextTo);
  }

  const activeLabel = TAB_ITEMS.find((t) => t.value === activeTab)?.label ?? '概要';

  return (
    <div className="flex flex-col min-h-0 h-full gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <h1 className="text-xl font-semibold">利用状況ダッシュボード</h1>
        <PeriodFilter period={period} from={from} to={to} onChange={handlePeriodChange} />
      </div>

      {/* Compact SelectionPicker — shown below md breakpoint */}
      <div className="md:hidden shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-medium">
              {activeLabel}
              <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
            align="start"
          >
            {TAB_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onSelect={() => setActiveTab(item.value)}
                className="justify-between"
              >
                {item.label}
                {item.value === activeTab && <CheckIcon className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="min-h-0 min-w-0 flex-1"
      >
        {/* Medium / Expanded Tabs — shown at md and above */}
        <TabsList className="hidden md:flex w-full h-10 justify-start gap-1 rounded-none border-b border-border bg-transparent px-0 shrink-0">
          {TAB_ITEMS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={[
                'h-full rounded-none border-0 border-b-2 border-transparent bg-transparent px-4',
                'text-muted-foreground font-medium shadow-none',
                'hover:text-foreground hover:border-border/60',
                'data-active:border-foreground data-active:text-foreground data-active:font-semibold data-active:bg-transparent',
                'dark:data-active:border-foreground dark:data-active:bg-transparent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'transition-colors',
              ].join(' ')}
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-3 overflow-auto">
          <OverviewTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="users" className="mt-3 min-h-0 flex flex-col">
          <UsersTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="agents" className="mt-3 min-h-0 flex flex-col">
          <AgentsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="tools" className="mt-3 min-h-0 flex flex-col">
          <ToolsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="skills" className="mt-3 min-h-0 flex flex-col">
          <SkillsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="traces" className="mt-3 min-h-0 flex flex-col">
          <TracesTab
            from={from}
            to={to}
            onSelectTrace={setSelectedTraceId}
            initialUserId={initialUserId}
          />
        </TabsContent>
      </Tabs>

      <TraceDetailDrawer
        traceId={selectedTraceId}
        onClose={() => setSelectedTraceId(null)}
      />
    </div>
  );
}
