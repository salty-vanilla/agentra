'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatAdminRole, formatUserEnabled } from '@/lib/admin-labels';
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

function getActionErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.body !== null &&
    typeof error.body === 'object' &&
    'error' in error.body
  ) {
    return String((error.body as { error: unknown }).error);
  }
  return '操作に失敗しました。もう一度お試しください。';
}

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
        promote: '管理者に昇格しました',
        'remove-admin': '管理者権限を削除しました',
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
      toast.error(getActionErrorMessage(error));
    },
  });

  function openConfirm(action: ActionType) {
    const configs: Record<ActionType, Omit<ConfirmState, 'action'>> = {
      promote: {
        title: '管理者に昇格',
        description: 'このユーザーを管理者グループに追加します。',
        confirmLabel: '昇格する',
        isDestructive: false,
      },
      'remove-admin': {
        title: '管理者権限を削除',
        description: 'このユーザーを管理者グループから削除します。',
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

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}をコピーしました`);
    } catch {
      toast.error(`${label}のコピーに失敗しました`);
    }
  }

  return (
    <>
      <Sheet open={user !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>ユーザー詳細</SheetTitle>
          </SheetHeader>

          {user && (
            <div className="px-4 space-y-1">
              <dl>
                <DetailRow label="メールアドレス" value={user.email} />
                <DetailRow
                  label="ロール"
                  value={
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {formatAdminRole(user.role)}
                    </Badge>
                  }
                />
                <DetailRow
                  label="状態"
                  value={
                    <Badge variant={user.enabled ? 'success' : 'destructive'}>
                      {formatUserEnabled(user.enabled)}
                    </Badge>
                  }
                />
                <DetailRow label="作成日" value={formatDate(user.createdAt)} />
                {user.lastSeenAt && (
                  <DetailRow label="最終利用" value={formatDate(user.lastSeenAt)} />
                )}
              </dl>

              <p className="text-xs font-medium text-muted-foreground pt-4 pb-1">
                識別子
              </p>
              <dl>
                <DetailRow
                  label="User ID"
                  value={
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="font-mono text-xs min-w-0 flex-1 break-all">
                        {user.userId}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => copyToClipboard(user.userId, 'User ID')}
                        aria-label="User IDをコピー"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </span>
                  }
                />
                <DetailRow
                  label="Sub"
                  value={
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="font-mono text-xs min-w-0 flex-1 break-all">
                        {user.sub}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => copyToClipboard(user.sub, 'Sub')}
                        aria-label="Subをコピー"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </span>
                  }
                />
              </dl>

              {(user.requestCount !== undefined ||
                user.totalTokens !== undefined ||
                user.errorRate !== undefined) && (
                <>
                  <p className="text-xs font-medium text-muted-foreground pt-4 pb-1">
                    利用状況 (過去30日)
                  </p>
                  <dl>
                    {user.requestCount !== undefined && (
                      <DetailRow
                        label="リクエスト"
                        value={user.requestCount.toLocaleString()}
                      />
                    )}
                    {user.totalTokens !== undefined && (
                      <DetailRow
                        label="合計トークン"
                        value={user.totalTokens.toLocaleString()}
                      />
                    )}
                    {user.errorRate !== undefined && (
                      <DetailRow
                        label="エラー率"
                        value={`${(user.errorRate * 100).toFixed(1)}%`}
                      />
                    )}
                    {user.mostUsedAgent && (
                      <DetailRow label="上位エージェント" value={user.mostUsedAgent} />
                    )}
                    {user.mostUsedTool && (
                      <DetailRow label="上位ツール" value={user.mostUsedTool} />
                    )}
                  </dl>
                </>
              )}

              <p className="text-xs font-medium text-muted-foreground pt-4 pb-1">操作</p>
              <div className="flex flex-col gap-2">
                {user.role === 'user' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('promote')}
                    disabled={mutation.isPending}
                  >
                    管理者に昇格
                  </Button>
                )}
                {user.role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfirm('remove-admin')}
                    disabled={mutation.isPending || isSelf}
                    title={isSelf ? '自分自身の管理者権限は削除できません' : undefined}
                  >
                    管理者権限を削除
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
                  トレースを表示
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
