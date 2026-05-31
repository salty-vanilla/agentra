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
          <SheetTitle>エージェント詳細</SheetTitle>
        </SheetHeader>

        {agent && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="エージェント" value={agent.agentName} />
              <DetailRow label="呼び出し" value={agent.callCount.toLocaleString()} />
              <DetailRow
                label="成功率"
                value={`${(agent.successRate * 100).toFixed(1)}%`}
              />
              <DetailRow
                label="エラー率"
                value={`${(agent.errorRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="平均時間" value={`${agent.avgDurationMs}ms`} />
              <DetailRow
                label="合計トークン"
                value={agent.totalTokens.toLocaleString()}
              />
              <DetailRow
                label="関連ツール"
                value={agent.relatedTools.join(', ') || '—'}
              />
            </dl>

            <div className="pt-4">
              <Button variant="outline" disabled>
                関連トレースを表示
                <span className="ml-2 text-xs text-muted-foreground">(準備中)</span>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
