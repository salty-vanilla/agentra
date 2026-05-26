'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminAgentStats } from '@/lib/generated/model';
import { DetailRow } from './detail-row';

type Props = {
  agent: AdminAgentStats | null;
  onClose: () => void;
};

export function AgentDetailDrawer({ agent, onClose }: Props) {
  return (
    <Sheet open={agent !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Agent Detail</SheetTitle>
        </SheetHeader>

        {agent && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="Agent" value={agent.agentName} />
              <DetailRow label="Calls" value={agent.callCount.toLocaleString()} />
              <DetailRow
                label="Success Rate"
                value={`${(agent.successRate * 100).toFixed(1)}%`}
              />
              <DetailRow
                label="Error Rate"
                value={`${(agent.errorRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="Avg Duration" value={`${agent.avgDurationMs}ms`} />
              <DetailRow
                label="Total Tokens"
                value={agent.totalTokens.toLocaleString()}
              />
              <DetailRow
                label="Related Tools"
                value={agent.relatedTools.join(', ') || '—'}
              />
            </dl>

            <div className="pt-4">
              <Button variant="outline" disabled>
                View related traces →
                <span className="ml-2 text-xs text-muted-foreground">(coming soon)</span>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
