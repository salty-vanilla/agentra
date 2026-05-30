'use client';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VALID_TABS = new Set(['overview', 'users', 'agents', 'tools', 'skills', 'traces']);

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
  const [activeTab, setActiveTab] = useState(
    VALID_TABS.has(initialTab) ? initialTab : 'overview',
  );
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  function handlePeriodChange(p: Period, nextFrom: string, nextTo: string) {
    setPeriod(p);
    setFrom(nextFrom);
    setTo(nextTo);
  }

  return (
    <div className="flex flex-col min-h-0 h-full gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <h1 className="text-xl font-semibold">可観測性ダッシュボード</h1>
        <PeriodFilter period={period} from={from} to={to} onChange={handlePeriodChange} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 min-w-0 flex-1"
      >
        <TabsList className="max-w-full shrink-0 justify-start overflow-x-auto">
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="users">ユーザー</TabsTrigger>
          <TabsTrigger value="agents">エージェント</TabsTrigger>
          <TabsTrigger value="tools">ツール</TabsTrigger>
          <TabsTrigger value="skills">スキル</TabsTrigger>
          <TabsTrigger value="traces">トレース</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-2 overflow-auto">
          <OverviewTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="users" className="mt-2 min-h-0 flex flex-col">
          <UsersTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="agents" className="mt-2 min-h-0 flex flex-col">
          <AgentsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="tools" className="mt-2 min-h-0 flex flex-col">
          <ToolsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="skills" className="mt-2 min-h-0 flex flex-col">
          <SkillsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="traces" className="mt-2 min-h-0 flex flex-col">
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
