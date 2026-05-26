import { describe, expect, it } from 'vitest';
import { classifyChatError, PrematureSseEofError } from '../api';
import { ApiError } from '../api-error';

const mockSummaryWithToolFailures = { toolFailureCount: 2 };
const mockSummaryNoFailures = { toolFailureCount: 0 };

describe('classifyChatError', () => {
  it('classifies PrematureSseEofError as network_disconnect', () => {
    const result = classifyChatError(new PrematureSseEofError());
    expect(result.kind).toBe('network_disconnect');
    expect(result.userMessage).toContain('切断');
  });

  it('classifies ApiError(401) as auth_error', () => {
    const result = classifyChatError(new ApiError(401, null));
    expect(result.kind).toBe('auth_error');
    expect(result.userMessage).toContain('セッション');
  });

  it('classifies ApiError(403) as auth_error', () => {
    const result = classifyChatError(new ApiError(403, null));
    expect(result.kind).toBe('auth_error');
  });

  it('classifies timeout error as timeout', () => {
    const result = classifyChatError(new Error('Request timeout after 30s'));
    expect(result.kind).toBe('timeout');
    expect(result.userMessage).toContain('タイムアウト');
  });

  it('classifies timeout error case-insensitively', () => {
    const result = classifyChatError(new Error('TIMEOUT occurred'));
    expect(result.kind).toBe('timeout');
  });

  it('classifies SSE error with timeout wording as timeout', () => {
    const result = classifyChatError(
      new Error('Processing timeout: agent did not respond'),
    );
    expect(result.kind).toBe('timeout');
  });

  it('classifies ApiError(500) as server_error', () => {
    const result = classifyChatError(new ApiError(500, null));
    expect(result.kind).toBe('server_error');
    expect(result.userMessage).toContain('サーバーエラー');
  });

  it('classifies ApiError(503) as server_error', () => {
    const result = classifyChatError(new ApiError(503, null));
    expect(result.kind).toBe('server_error');
  });

  it('classifies error with toolFailureCount > 0 as tool_failure', () => {
    const result = classifyChatError(
      new Error('something failed'),
      mockSummaryWithToolFailures,
    );
    expect(result.kind).toBe('tool_failure');
    expect(result.userMessage).toContain('ツール');
  });

  it('classifies unknown error as unknown', () => {
    const result = classifyChatError(new Error('some unexpected error'));
    expect(result.kind).toBe('unknown');
  });

  it('classifies non-Error value as unknown', () => {
    const result = classifyChatError('raw string error');
    expect(result.kind).toBe('unknown');
  });

  it('classifies plain Error with toolFailureCount 0 as unknown', () => {
    const result = classifyChatError(new Error('backend error'), mockSummaryNoFailures);
    expect(result.kind).toBe('unknown');
  });

  it('prioritizes PrematureSseEofError over tool_failure', () => {
    const result = classifyChatError(
      new PrematureSseEofError(),
      mockSummaryWithToolFailures,
    );
    expect(result.kind).toBe('network_disconnect');
  });

  it('prioritizes auth_error over tool_failure', () => {
    const result = classifyChatError(
      new ApiError(401, null),
      mockSummaryWithToolFailures,
    );
    expect(result.kind).toBe('auth_error');
  });
});
