'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminToolStats } from '@/lib/generated/model';
import { DetailRow } from './detail-row';

type Props = {
  tool: AdminToolStats | null;
  onClose: () => void;
};

export function ToolDetailDrawer({ tool, onClose }: Props) {
  return (
    <Sheet open={tool !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>ツール詳細</SheetTitle>
        </SheetHeader>

        {tool && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="ツール" value={tool.toolName} />
              <DetailRow label="呼び出し" value={tool.callCount.toLocaleString()} />
              <DetailRow
                label="失敗率"
                value={`${(tool.failureRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="平均時間" value={`${tool.avgDurationMs}ms`} />
              <DetailRow label="直近エラー" value={tool.lastError ?? '—'} />
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
