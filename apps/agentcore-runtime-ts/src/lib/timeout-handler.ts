export interface TimeoutConfig {
  timeoutMs: number;
  onTimeout?: (reason: string) => void;
}

export interface CallTelemetry {
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  timedOut: boolean;
  cancelled: boolean;
  error?: Error;
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class CancelledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelledError';
  }
}

export async function executeWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  config: TimeoutConfig,
  telemetry: CallTelemetry,
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    telemetry.timedOut = true;
    config.onTimeout?.(`Operation exceeded ${config.timeoutMs}ms timeout`);
    controller.abort(
      new TimeoutError(
        `Operation exceeded ${config.timeoutMs}ms timeout`,
        config.timeoutMs,
      ),
    );
  }, config.timeoutMs);

  try {
    const result = await operation(controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted) {
      if (error instanceof TimeoutError) {
        telemetry.timedOut = true;
        throw error;
      }
      telemetry.cancelled = true;
      throw new CancelledError('Operation was cancelled');
    }
    telemetry.error = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    telemetry.completedAt = Date.now();
    telemetry.durationMs = telemetry.completedAt - telemetry.startedAt;
  }
}

export function createCallTelemetry(): CallTelemetry {
  return {
    startedAt: Date.now(),
    timedOut: false,
    cancelled: false,
  };
}

export function formatTelemetryLog(
  operationName: string,
  telemetry: CallTelemetry,
): string {
  const status = telemetry.timedOut
    ? 'timeout'
    : telemetry.cancelled
      ? 'cancelled'
      : 'success';
  const errorMsg = telemetry.error ? ` error=${telemetry.error.message}` : '';
  return `[${operationName}] status=${status} duration=${telemetry.durationMs}ms${errorMsg}`;
}
