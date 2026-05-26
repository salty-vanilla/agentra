export type UserRole = 'admin' | 'user';

export function getAdminGroupName(): string {
  return process.env.ADMIN_GROUP_NAME ?? 'agentra-admin';
}

export function deriveUserRole(groups: string[]): UserRole {
  return groups.includes(getAdminGroupName()) ? 'admin' : 'user';
}
