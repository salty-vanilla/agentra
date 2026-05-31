'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatAdminRole } from '@/lib/admin-labels';
import { type InviteAdminUserRequest, inviteAdminUser } from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { agentraQueryKeys } from '@/lib/query-options';

type Role = 'user' | 'admin';

type Props = {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
  defaultRole?: Role;
  initialSuccessEmail?: string;
};

type FormState = {
  email: string;
  name: string;
  role: Role;
  sendInvitation: boolean;
};

const DEFAULT_FORM: FormState = {
  email: '',
  name: '',
  role: 'user',
  sendInvitation: true,
};

export function AdminUserInviteDialog({
  open,
  onClose,
  onInvited,
  defaultRole,
  initialSuccessEmail,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    role: defaultRole ?? 'user',
  });
  const [successEmail, setSuccessEmail] = useState<string | null>(
    initialSuccessEmail ?? null,
  );

  const mutation = useMutation({
    mutationFn: (req: InviteAdminUserRequest) => inviteAdminUser(req),
    onSuccess: (_, req) => {
      queryClient.invalidateQueries({ queryKey: agentraQueryKeys.adminUsersListRoot });
      setSuccessEmail(req.email);
      onInvited?.();
    },
  });

  function handleClose() {
    setForm(DEFAULT_FORM);
    setSuccessEmail(null);
    mutation.reset();
    onClose();
  }

  function handleInviteAnother() {
    setForm(DEFAULT_FORM);
    setSuccessEmail(null);
    mutation.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const req: InviteAdminUserRequest = {
      email: form.email,
      role: form.role,
      sendInvitation: form.sendInvitation,
      ...(form.name.trim() ? { name: form.name.trim() } : {}),
    };
    mutation.mutate(req);
  }

  const isConflict = mutation.error instanceof ApiError && mutation.error.status === 409;

  const errorMessage = mutation.isError
    ? isConflict
      ? 'このメールアドレスのユーザーは既に存在します。'
      : '招待に失敗しました。もう一度お試しください。'
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ユーザーを招待</DialogTitle>
        </DialogHeader>

        {successEmail ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <CheckCircleIcon className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm">
                <strong>{successEmail}</strong> を招待しました。
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleInviteAnother}>
                続けて招待する
              </Button>
              <Button onClick={handleClose}>閉じる</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-email">
                メールアドレス <span className="text-destructive">*</span>
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                disabled={mutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-name">
                名前 <span className="text-xs text-muted-foreground">(任意)</span>
              </label>
              <Input
                id="invite-name"
                type="text"
                placeholder="例: 山田 太郎"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={mutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">ロール</p>
              <div className="flex gap-2">
                {(['user', 'admin'] as Role[]).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={form.role === r ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    disabled={mutation.isPending}
                  >
                    {formatAdminRole(r)}
                  </Button>
                ))}
              </div>
              {form.role === 'admin' && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                  <p className="text-xs">
                    この権限を付与すると管理 API へのアクセスが許可されます。
                  </p>
                </div>
              )}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.sendInvitation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sendInvitation: e.target.checked }))
                }
                disabled={mutation.isPending}
                className="accent-primary"
              />
              招待メールを送信する
            </label>

            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={mutation.isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={mutation.isPending || !form.email}>
                {mutation.isPending ? '招待中...' : '招待する'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
