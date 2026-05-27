'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { AdminUser, AdminUserActionResponse } from '@/lib/api';
import {
  disableAdminUser,
  enableAdminUser,
  promoteAdminUser,
  removeAdminUser,
  resendAdminUserInvite,
} from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { agentraQueryKeys } from '@/lib/query-options';
import { useCurrentUserSub } from '@/lib/use-current-user-sub';
import { DetailRow } from './detail-row';
import { UserActionConfirmDialog } from './user-action-confirm-dialog';

type ActionType = 'promote' | 'remove-admin' | 'disable' | 'enable' | 'resend-invite';

type ConfirmState = {
  action: ActionType;
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive: boolean;
};

type Props = {
  user: AdminUser | null;
  onClose: () => void;
  onUserUpdated?: (updated: AdminUser) => void;
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function AdminUserDetailDrawer({ user, onClose, onUserUpdated }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUserSub = useCurrentUserSub();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  function handleViewTraces() {
    if (!user) return;
    router.push(
      `/admin/observability?tab=traces&userId=${encodeURIComponent(user.userId)}`,
    );
  }

  const mutation = useMutation({
    mutationFn: async (action: ActionType): Promise<AdminUserActionResponse> => {
      if (!user) throw new Error('No user selected');
      switch (action) {
        case 'promote':
          return promoteAdminUser(user.sub);
        case 'remove-admin':
          return removeAdminUser(user.sub);
        case 'disable':
          return disableAdminUser(user.sub);
        case 'enable':
          return enableAdminUser(user.sub);
        case 'resend-invite':
          return resendAdminUserInvite(user.sub);
      }
    },
    onSuccess: (data, action) => {
      const labels: Record<ActionType, string> = {
        promote: 'Admin に昇格しました',
        'remove-admin': 'Admin 権限を削除しました',
        disable: 'ユーザーを無効にしました',
        enable: 'ユーザーを有効にしました',
        'resend-invite': '招待メールを再送しました',
      };
      toast.success(labels[action]);
      if (user && onUserUpdated) {
        onUserUpdated({ ...user, role: data.role, enabled: data.enabled });
      }
      queryClient.invalidateQueries({ queryKey: agentraQueryKeys.adminUsersListRoot });
      onClose();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : '操作に失敗しました。もう一度お試しください。';
      toast.error(message);
    },
  });

  function openConfirm(action: ActionType) {
    const configs: Record<ActionType, Omit<ConfirmState, 'action'>> = {
      promote: {
        title: 'Admin に昇格',
        description: 'このユーザーを Admin グループに追加します。',
        confirmLabel: '昇格する',
        isDestructive: false,
      },
      'remove-admin': {
        title: 'Admin 権限を削除',
        description: 'このユーザーを Admin グループから削除します。',
        confirmLabel: '削除する',
        isDestructive: true,
      },
      disable: {
        title: 'ユーザーを無効化',
        description: 'このユーザーのログインを禁止します。',
        confirmLabel: '無効にする',
        isDestructive: true,
      },
      enable: {
        title: 'ユーザーを有効化',
        description: 'このユーザーのログインを再び許可します。',
        confirmLabel: '有効にする',
        isDestructive: false,
      },
      'resend-invite': {
        title: '招待メールを再送',
        description:
          '招待メールを再送します。まだログインしていないユーザー向けです。すでにアカウントを有効化済みの場合は失敗することがあります。',
        confirmLabel: '再送する',
        isDestructive: false,
      },
    };
    setConfirmState({ action, ...configs[action] });
  }

  function handleConfirm() {
    if (!confirmState) return;
    mutation.mutate(confirmState.action);
    setConfirmState(null);
  }

  const isSelf = user?.sub === currentUserSub;

  return (
    <>
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
                  value={
                    <span className="font-mono text-xs break-all">{user.userId}</span>
                  }
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
                <DetailRow
                  label="Status"
                  value={
                    <Badge variant={user.enabled ? 'secondary' : 'destructive'}>
                      {user.enabled ? 'Active' : 'Disabled'}
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

              <p className="text-xs font-medium text-muted-foreground pt-4 pb-1">
                Actions
              </p>
              <div className="flex flex-col gap-2">
                {user.role === 'user' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('promote')}
                    disabled={mutation.isPending}
                  >
                    Admin に昇格
                  </Button>
                )}
                {user.role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('remove-admin')}
                    disabled={mutation.isPending || isSelf}
                    title={isSelf ? '自分自身の Admin 権限は削除できません' : undefined}
                  >
                    Admin 権限を削除
                  </Button>
                )}
                {user.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('disable')}
                    disabled={mutation.isPending || isSelf}
                    title={isSelf ? '自分自身を無効化することはできません' : undefined}
                  >
                    無効化
                  </Button>
                )}
                {!user.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('enable')}
                    disabled={mutation.isPending}
                  >
                    有効化
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openConfirm('resend-invite')}
                  disabled={mutation.isPending}
                >
                  招待メールを再送
                </Button>
              </div>

              <div className="pt-4">
                <Button variant="outline" onClick={handleViewTraces}>
                  View traces
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {confirmState && (
        <UserActionConfirmDialog
          open={confirmState !== null}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          isDestructive={confirmState.isDestructive}
          isPending={mutation.isPending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
