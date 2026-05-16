import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeLogger } from '../runtime-logger.js';

describe('RuntimeLogger', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it('logs invocation start with correct fields', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logInvocationStart({ userId: 'user-789' });

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const logCall = consoleInfoSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall as string);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'agent_request_start',
      traceId: 'trace-123',
      threadId: 'thread-456',
      model: 'sonnet',
      userId: 'user-789',
    });
    expect(parsed.timestamp).toBeDefined();
  });

  it('logs invocation end with duration and token usage', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logInvocationEnd(1234, {
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    });

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'agent_request_end',
      traceId: 'trace-123',
      durationMs: 1234,
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    });
  });

  it('logs invocation error with sanitized error details', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    const error = new Error('Something went wrong');

    logger.logInvocationError(error, {
      finalObservation: { status: 'error' },
    });

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'error',
      message: 'agent_request_error',
      traceId: 'trace-123',
      error: {
        name: 'Error',
        message: 'Something went wrong',
      },
    });
    expect(parsed.error.stack).toBeDefined();
    expect(parsed.finalObservation.status).toBe('error');
  });

  it('extracts AWS request ID from error object', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    const error = new Error('API Error');
    (error as Record<string, unknown>).$metadata = {
      requestId: 'aws-req-123',
    };

    logger.logInvocationError(error);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed.error.requestId).toBe('aws-req-123');
  });

  it('handles string errors gracefully', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logInvocationError('A string error occurred');

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed.error.message).toBe('A string error occurred');
  });

  it('handles non-Error objects gracefully', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    const error = { code: 'CUSTOM_ERROR', details: 'Some details' };

    logger.logInvocationError(error);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed.error).toBeDefined();
  });

  it('logs observation summary', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    const summary = {
      traceId: 'trace-123',
      startedAt: '2026-05-15T00:00:00Z',
      completedAt: '2026-05-15T00:00:05Z',
      durationMs: 5000,
      status: 'success' as const,
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      toolCallCount: 2,
      toolFailureCount: 0,
    };

    logger.logObservationSummary(summary);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'observation_summary',
      traceId: 'trace-123',
      ...summary,
    });
  });

  it('sets request ID dynamically', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    logger.setRequestId('request-xyz');

    logger.info('test message');

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed.requestId).toBe('request-xyz');
  });

  it('truncates very long error messages and stacks', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');
    const longMessage = 'x'.repeat(1000);
    const error = new Error(longMessage);
    error.stack = 'y'.repeat(2000);

    logger.logInvocationError(error);

    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed.error.message.length).toBeLessThanOrEqual(500);
    expect(parsed.error.stack.length).toBeLessThanOrEqual(1000);
  });

  it('logs debug, info, warn, and error messages', () => {
    const logger = new RuntimeLogger('trace-123');

    logger.debug('debug message', { data: 'value' });
    logger.info('info message', { data: 'value' });
    logger.warn('warn message', { data: 'value' });
    logger.error('error message', { data: 'value' });

    expect(consoleInfoSpy).toHaveBeenCalledTimes(4);

    const calls = consoleInfoSpy.mock.calls.map((call) => JSON.parse(call[0] as string));

    expect(calls[0].level).toBe('debug');
    expect(calls[1].level).toBe('info');
    expect(calls[2].level).toBe('warn');
    expect(calls[3].level).toBe('error');

    calls.forEach((call) => {
      expect(call.traceId).toBe('trace-123');
      expect(call.data).toBe('value');
    });
  });

  it('includes threadId only when provided', () => {
    const loggerWithThread = new RuntimeLogger('trace-123', 'thread-456');
    const loggerWithoutThread = new RuntimeLogger('trace-123');

    loggerWithThread.info('test');
    loggerWithoutThread.info('test');

    const withThreadLog = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);
    const withoutThreadLog = JSON.parse(consoleInfoSpy.mock.calls[1][0] as string);

    expect(withThreadLog.threadId).toBe('thread-456');
    expect(withoutThreadLog.threadId).toBeUndefined();
  });

  it('logs tool call start with toolUseId and toolName', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logToolCallStart('tool-use-abc', 'search_web');

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'tool_call_start',
      traceId: 'trace-123',
      toolUseId: 'tool-use-abc',
      toolName: 'search_web',
    });
  });

  it('logs tool call end with duration', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logToolCallEnd('tool-use-abc', 'search_web', 456);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'tool_call_end',
      traceId: 'trace-123',
      toolUseId: 'tool-use-abc',
      toolName: 'search_web',
      durationMs: 456,
    });
  });

  it('logs tool call error at error level', () => {
    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet');

    logger.logToolCallError('tool-use-abc', 'search_web', 789);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleInfoSpy.mock.calls[0][0] as string);

    expect(parsed).toMatchObject({
      level: 'error',
      message: 'tool_call_error',
      traceId: 'trace-123',
      toolUseId: 'tool-use-abc',
      toolName: 'search_web',
      durationMs: 789,
    });
  });

  it('routes logs through pino logger when provided, bypassing console.info', () => {
    const pinoInfo = vi.fn();
    const mockLogger = {
      info: pinoInfo,
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as FastifyBaseLogger;

    const logger = new RuntimeLogger('trace-123', 'thread-456', 'sonnet', mockLogger);
    logger.info('test message', { extra: 'data' });

    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(pinoInfo).toHaveBeenCalledOnce();
    expect(pinoInfo).toHaveBeenCalledWith(
      { traceId: 'trace-123', threadId: 'thread-456', model: 'sonnet', extra: 'data' },
      'test message',
    );
  });
});
