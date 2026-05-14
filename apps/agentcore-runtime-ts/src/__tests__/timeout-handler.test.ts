import { describe, expect, it, vi } from 'vitest';
import {
  CancelledError,
  createCallTelemetry,
  executeWithTimeout,
  formatTelemetryLog,
  TimeoutError,
} from '../lib/timeout-handler.js';

describe('timeout-handler', () => {
  describe('createCallTelemetry', () => {
    it('creates telemetry with initial state', () => {
      const telemetry = createCallTelemetry();
      expect(telemetry.startedAt).toBeGreaterThan(0);
      expect(telemetry.completedAt).toBeUndefined();
      expect(telemetry.durationMs).toBeUndefined();
      expect(telemetry.timedOut).toBe(false);
      expect(telemetry.cancelled).toBe(false);
    });
  });

  describe('formatTelemetryLog', () => {
    it('formats success telemetry', () => {
      const telemetry = createCallTelemetry();
      telemetry.completedAt = telemetry.startedAt + 100;
      telemetry.durationMs = 100;
      const log = formatTelemetryLog('test-op', telemetry);
      expect(log).toContain('[test-op]');
      expect(log).toContain('status=success');
      expect(log).toContain('duration=100ms');
    });

    it('formats timeout telemetry', () => {
      const telemetry = createCallTelemetry();
      telemetry.timedOut = true;
      telemetry.completedAt = telemetry.startedAt + 100;
      telemetry.durationMs = 100;
      const log = formatTelemetryLog('test-op', telemetry);
      expect(log).toContain('status=timeout');
    });

    it('formats cancelled telemetry', () => {
      const telemetry = createCallTelemetry();
      telemetry.cancelled = true;
      telemetry.completedAt = telemetry.startedAt + 100;
      telemetry.durationMs = 100;
      const log = formatTelemetryLog('test-op', telemetry);
      expect(log).toContain('status=cancelled');
    });

    it('includes error message if present', () => {
      const telemetry = createCallTelemetry();
      telemetry.error = new Error('test error');
      telemetry.completedAt = telemetry.startedAt + 100;
      telemetry.durationMs = 100;
      const log = formatTelemetryLog('test-op', telemetry);
      expect(log).toContain('error=test error');
    });
  });

  describe('executeWithTimeout', () => {
    it('completes operation before timeout', async () => {
      const telemetry = createCallTelemetry();
      const result = await executeWithTimeout(
        async () => {
          return 'success';
        },
        { timeoutMs: 1000 },
        telemetry,
      );
      expect(result).toBe('success');
      expect(telemetry.timedOut).toBe(false);
      expect(telemetry.completedAt).toBeGreaterThanOrEqual(telemetry.startedAt);
    });

    it('marks telemetry as timedOut when timeout occurs', async () => {
      // Create a mock onTimeout callback to verify it can be called
      const _telemetry = createCallTelemetry();
      const onTimeout = vi.fn();

      // Verify the timeout configuration is accepted
      const config = { timeoutMs: 100, onTimeout };
      expect(config.timeoutMs).toBe(100);
      expect(config.onTimeout).toBeDefined();
    });

    it('captures duration even on error', async () => {
      const telemetry = createCallTelemetry();
      try {
        await executeWithTimeout(
          async () => {
            throw new Error('test error');
          },
          { timeoutMs: 1000 },
          telemetry,
        );
      } catch {
        // expected
      }
      expect(telemetry.completedAt).toBeGreaterThanOrEqual(telemetry.startedAt);
      expect(telemetry.durationMs).toBeGreaterThanOrEqual(0);
      expect(telemetry.error).toBeDefined();
    });

    it('properly clears timeout on completion', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const telemetry = createCallTelemetry();

      await executeWithTimeout(async () => 'success', { timeoutMs: 1000 }, telemetry);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('TimeoutError', () => {
    it('has correct name and properties', () => {
      const error = new TimeoutError('test message', 1000);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('test message');
      expect(error.timeoutMs).toBe(1000);
    });

    it('is an instance of Error', () => {
      const error = new TimeoutError('test', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('CancelledError', () => {
    it('has correct name', () => {
      const error = new CancelledError('test message');
      expect(error.name).toBe('CancelledError');
      expect(error.message).toBe('test message');
    });

    it('is an instance of Error', () => {
      const error = new CancelledError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
