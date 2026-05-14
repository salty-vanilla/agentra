export interface CallTelemetry {
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  timedOut: boolean;
  cancelled: boolean;
  error?: Error;
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
