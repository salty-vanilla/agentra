'use client';

import type { AdminUser } from '@/lib/api';
import { AdminResponsiveDetail } from './admin-responsive-detail';
import { UserDetailContent } from './user-detail-content';

type Props = {
  user: AdminUser | null;
  onClose: () => void;
  onUserUpdated?: (updated: AdminUser) => void;
};

/**
 * Medium-mode modal Drawer for a single Admin user. Kept as a thin wrapper over
 * {@link AdminResponsiveDetail} so existing call sites and stories that always
 * want the Drawer overlay keep working; the body is the shared
 * {@link UserDetailContent}.
 */
export function AdminUserDetailDrawer({ user, onClose, onUserUpdated }: Props) {
  return (
    <AdminResponsiveDetail
      mode="medium"
      open={user !== null}
      title="ユーザー詳細"
      onClose={onClose}
    >
      {user && (
        <UserDetailContent user={user} onClose={onClose} onUserUpdated={onUserUpdated} />
      )}
    </AdminResponsiveDetail>
  );
}
