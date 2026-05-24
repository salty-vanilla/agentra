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
          <SheetTitle>Tool Detail</SheetTitle>
        </SheetHeader>

        {tool && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow label="Tool" value={tool.toolName} />
              <DetailRow label="Calls" value={tool.callCount.toLocaleString()} />
              <DetailRow
                label="Failure Rate"
                value={`${(tool.failureRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="Avg Duration" value={`${tool.avgDurationMs}ms`} />
              <DetailRow label="Last Error" value={tool.lastError ?? '—'} />
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
