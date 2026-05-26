'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminUser } from '@/lib/api';
import { DetailRow } from './detail-row';

type Props = {
  user: AdminUser | null;
  onClose: () => void;
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function AdminUserDetailDrawer({ user, onClose }: Props) {
  const router = useRouter();

  function handleViewTraces() {
    if (!user) return;
    router.push(
      `/admin/observability?tab=traces&userId=${encodeURIComponent(user.userId)}`,
    );
  }

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
              <DetailRow
                label="Sub"
                value={<span className="font-mono text-xs break-all">{user.sub}</span>}
              />
              <DetailRow label="Email" value={user.email} />
              <DetailRow
                label="Role"
                value={
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </Badge>
                }
              />
              <DetailRow label="Created" value={formatDate(user.createdAt)} />

              {user.lastSeenAt && (
                <DetailRow label="Last Seen" value={formatDate(user.lastSeenAt)} />
              )}
            </dl>

            {(user.requestCount !== undefined ||
              user.totalTokens !== undefined ||
              user.errorRate !== undefined) && (
              <>
                <p className="text-xs font-medium text-muted-foreground pt-4 pb-1">
                  Usage (last 30 days)
                </p>
                <dl>
                  {user.requestCount !== undefined && (
                    <DetailRow
                      label="Requests"
                      value={user.requestCount.toLocaleString()}
                    />
                  )}
                  {user.totalTokens !== undefined && (
                    <DetailRow
                      label="Total Tokens"
                      value={user.totalTokens.toLocaleString()}
                    />
                  )}
                  {user.errorRate !== undefined && (
                    <DetailRow
                      label="Error Rate"
                      value={`${(user.errorRate * 100).toFixed(1)}%`}
                    />
                  )}
                  {user.mostUsedAgent && (
                    <DetailRow label="Top Agent" value={user.mostUsedAgent} />
                  )}
                  {user.mostUsedTool && (
                    <DetailRow label="Top Tool" value={user.mostUsedTool} />
                  )}
                </dl>
              </>
            )}

            <div className="pt-4">
              <Button variant="outline" onClick={handleViewTraces}>
                View traces
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
