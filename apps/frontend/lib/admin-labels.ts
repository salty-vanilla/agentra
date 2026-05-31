export function formatAdminRole(role: string | undefined): string {
  if (role === 'admin') return '管理者';
  if (role === 'user') return '一般ユーザー';
  return role ?? '—';
}

export function formatUserEnabled(enabled: boolean): string {
  return enabled ? '有効' : '無効';
}

export function formatTraceStatus(status: string | undefined): string {
  if (status === 'success') return '成功';
  if (status === 'error') return 'エラー';
  if (status === 'cancelled') return 'キャンセル';
  return status ?? '—';
}

export function formatTraceCallKind(kind: string): string {
  if (kind === 'tool') return 'ツール';
  if (kind === 'agent') return 'エージェント';
  if (kind === 'skill') return 'スキル';
  return kind;
}

export function formatIngestionStatus(status: string): string {
  if (status === 'STARTING') return '開始中';
  if (status === 'IN_PROGRESS') return '実行中';
  if (status === 'COMPLETE') return '完了';
  if (status === 'FAILED') return '失敗';
  if (status === 'STOPPING') return '停止中';
  if (status === 'STOPPED') return '停止済み';
  return status;
}
