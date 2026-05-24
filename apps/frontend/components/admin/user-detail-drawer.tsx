'use client';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminUserStats } from '@/lib/generated/model';
import { DetailRow } from './detail-row';

type Props = {
  user: AdminUserStats | null;
  onClose: () => void;
};

export function UserDetailDrawer({ user, onClose }: Props) {
  return (
    <Sheet open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>User Detail</SheetTitle>
        </SheetHeader>

        {user && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow
                label="User ID"
                value={<span className="font-mono text-xs break-all">{user.userId}</span>}
              />
              <DetailRow label="Requests" value={user.requestCount.toLocaleString()} />
              <DetailRow label="Total Tokens" value={user.totalTokens.toLocaleString()} />
              <DetailRow label="Avg Duration" value={`${user.avgDurationMs}ms`} />
              <DetailRow
                label="Error Rate"
                value={`${(user.errorRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="Top Agent" value={user.mostUsedAgent ?? '—'} />
              <DetailRow label="Top Tool" value={user.mostUsedTool ?? '—'} />
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
