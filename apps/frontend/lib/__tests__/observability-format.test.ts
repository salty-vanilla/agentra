import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatToolLabel,
  sanitizeToolError,
} from '../observability-format';

describe('sanitizeToolError', () => {
  it('returns null for undefined', () => {
    expect(sanitizeToolError(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeToolError('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeToolError('   ')).toBeNull();
  });

  it('returns fixed message when authorization header with bearer token is present', () => {
    expect(sanitizeToolError('Authorization: Bearer abc123xyz')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('returns fixed message when bearer scheme appears alone', () => {
    expect(sanitizeToolError('bearer sk-abc')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message when token value follows key', () => {
    expect(sanitizeToolError('token abc123')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message when password is in the error', () => {
    expect(sanitizeToolError('password = hunter2')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message when api key pattern appears', () => {
    expect(sanitizeToolError('api key sk-abc123')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message for sk- style api keys appearing alone', () => {
    expect(sanitizeToolError('Invalid credential sk-abcdef123')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('returns fixed message when secret is present', () => {
    expect(sanitizeToolError('secret = mysecretvalue')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message for UPPER_SNAKE_CASE env var with KEY suffix', () => {
    expect(sanitizeToolError('OPENAI_API_KEY=abc123')).toBe('ツール実行に失敗しました');
  });

  it('returns fixed message for AWS_SECRET_ACCESS_KEY env var', () => {
    expect(sanitizeToolError('AWS_SECRET_ACCESS_KEY=abc123')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('returns fixed message for AWS_ACCESS_KEY_ID env var', () => {
    expect(sanitizeToolError('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('returns fixed message when AKIA-prefixed AWS key appears in message', () => {
    expect(sanitizeToolError('Invalid credential AKIAIOSFODNN7EXAMPLE')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('returns fixed message when ASIA-prefixed AWS STS credential appears', () => {
    expect(sanitizeToolError('Temporary credential ASIAIOSFODNN7EXAMPLE')).toBe(
      'ツール実行に失敗しました',
    );
  });

  it('does not flag safe error messages', () => {
    expect(sanitizeToolError('Search quota exceeded')).toBe('Search quota exceeded');
  });

  it('does not flag errors mentioning tokenization (not a credential)', () => {
    expect(sanitizeToolError('Tokenization pipeline failed')).toBe(
      'Tokenization pipeline failed',
    );
  });

  it('truncates long safe messages to 120 characters', () => {
    const long = 'x'.repeat(200);
    const result = sanitizeToolError(long);
    expect(result?.length).toBe(120);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds when under 1 second', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds when 1000ms or above', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(2345)).toBe('2.35s');
  });

  it('returns 0ms for negative values', () => {
    expect(formatDuration(-1)).toBe('0ms');
  });

  it('returns 0ms for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('0ms');
  });

  it('returns 0ms for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('0ms');
  });
});

describe('formatToolLabel', () => {
  it('returns Japanese label for known tool names', () => {
    expect(formatToolLabel('web_research')).toBe('Webリサーチ');
    expect(formatToolLabel('router')).toBe('ルーター');
    expect(formatToolLabel('search_knowledge_base')).toBe('ナレッジベース検索');
    expect(formatToolLabel('create_slide_presentation')).toBe('スライド生成');
  });

  it('returns the original tool name for unknown tools', () => {
    expect(formatToolLabel('some_unknown_tool')).toBe('some_unknown_tool');
    expect(formatToolLabel('')).toBe('');
  });
});
