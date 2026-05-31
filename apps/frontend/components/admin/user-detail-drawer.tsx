'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatAdminRole } from '@/lib/admin-labels';
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
          <SheetTitle>ユーザー詳細</SheetTitle>
        </SheetHeader>

        {user && (
          <div className="px-4 space-y-1">
            <dl>
              <DetailRow
                label="User ID"
                value={<span className="font-mono text-xs break-all">{user.userId}</span>}
              />
              <DetailRow
                label="ロール"
                value={
                  <Badge
                    variant={(user.role ?? 'user') === 'admin' ? 'default' : 'secondary'}
                  >
                    {formatAdminRole(user.role ?? 'user')}
                  </Badge>
                }
              />
              <DetailRow label="リクエスト" value={user.requestCount.toLocaleString()} />
              <DetailRow label="合計トークン" value={user.totalTokens.toLocaleString()} />
              <DetailRow label="平均時間" value={`${user.avgDurationMs}ms`} />
              <DetailRow
                label="エラー率"
                value={`${(user.errorRate * 100).toFixed(1)}%`}
              />
              <DetailRow label="上位エージェント" value={user.mostUsedAgent ?? '—'} />
              <DetailRow label="上位ツール" value={user.mostUsedTool ?? '—'} />
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
