'use client';

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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminDashboard() {
  const today = todayStr();
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  function handlePeriodChange(p: Period, nextFrom: string, nextTo: string) {
    setPeriod(p);
    setFrom(nextFrom);
    setTo(nextTo);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Observability Dashboard</h1>
        <PeriodFilter period={period} from={from} to={to} onChange={handlePeriodChange} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="agents" className="mt-4">
          <AgentsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="tools" className="mt-4">
          <ToolsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="skills" className="mt-4">
          <SkillsTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="traces" className="mt-4">
          <TracesTab from={from} to={to} onSelectTrace={setSelectedTraceId} />
        </TabsContent>
      </Tabs>

      <TraceDetailDrawer
        traceId={selectedTraceId}
        onClose={() => setSelectedTraceId(null)}
      />
    </div>
  );
}
