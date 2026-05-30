import { describe, expect, it } from 'vitest';
import {
  formatAdminRole,
  formatIngestionStatus,
  formatTraceCallKind,
  formatTraceStatus,
  formatUserEnabled,
} from '../admin-labels';

describe('admin-labels', () => {
  it('formats user roles with Japanese labels', () => {
    expect(formatAdminRole('admin')).toBe('管理者');
    expect(formatAdminRole('user')).toBe('一般ユーザー');
  });

  it('falls back to raw role values for unknown runtime data', () => {
    expect(formatAdminRole('auditor')).toBe('auditor');
    expect(formatAdminRole(undefined)).toBe('—');
  });

  it('formats enabled state', () => {
    expect(formatUserEnabled(true)).toBe('有効');
    expect(formatUserEnabled(false)).toBe('無効');
  });

  it('formats trace status values and preserves unknown values', () => {
    expect(formatTraceStatus('success')).toBe('成功');
    expect(formatTraceStatus('error')).toBe('エラー');
    expect(formatTraceStatus('cancelled')).toBe('キャンセル');
    expect(formatTraceStatus('queued')).toBe('queued');
    expect(formatTraceStatus(undefined)).toBe('—');
  });

  it('formats trace call kinds and preserves unknown values', () => {
    expect(formatTraceCallKind('tool')).toBe('ツール');
    expect(formatTraceCallKind('agent')).toBe('エージェント');
    expect(formatTraceCallKind('skill')).toBe('スキル');
    expect(formatTraceCallKind('worker')).toBe('worker');
  });

  it('formats ingestion status values and preserves unknown values', () => {
    expect(formatIngestionStatus('STARTING')).toBe('開始中');
    expect(formatIngestionStatus('IN_PROGRESS')).toBe('実行中');
    expect(formatIngestionStatus('COMPLETE')).toBe('完了');
    expect(formatIngestionStatus('FAILED')).toBe('失敗');
    expect(formatIngestionStatus('STOPPING')).toBe('停止中');
    expect(formatIngestionStatus('STOPPED')).toBe('停止済み');
    expect(formatIngestionStatus('PAUSED')).toBe('PAUSED');
  });
});
