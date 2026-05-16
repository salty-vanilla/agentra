import type { FastifyBaseLogger } from 'fastify';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = {
  traceId: string;
  threadId?: string;
  model?: string;
  requestId?: string;
};

type LogData = Record<string, unknown>;

function formatAwsRequestId(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const errorObj = error as Record<string, unknown>;

  if (typeof errorObj.$metadata === 'object' && errorObj.$metadata !== null) {
    const metadata = errorObj.$metadata as Record<string, unknown>;
    if (typeof metadata.requestId === 'string') {
      return metadata.requestId;
    }
  }

  if (typeof errorObj.requestId === 'string') {
    return errorObj.requestId;
  }

  return undefined;
}

function sanitizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  requestId?: string;
} {
  let name = 'UnknownError';
  let message = 'An unexpected error occurred';
  let stack: string | undefined;
  let requestId: string | undefined;

  if (error instanceof Error) {
    name = error.name;
    message = error.message;
    stack = error.stack;
    requestId = formatAwsRequestId(error);
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      message = errorObj.message;
    }
    if (typeof errorObj.name === 'string') {
      name = errorObj.name;
    }
    requestId = formatAwsRequestId(error);
  }

  return {
    name,
    message: message.slice(0, 500),
    ...(stack ? { stack: stack.slice(0, 1000) } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function structureLog(
  level: LogLevel,
  message: string,
  context: LogContext,
  data?: LogData,
  pinoLogger?: FastifyBaseLogger,
): void {
  const logData = {
    traceId: context.traceId,
    ...(context.threadId ? { threadId: context.threadId } : {}),
    ...(context.model ? { model: context.model } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(data ? data : {}),
  };

  if (pinoLogger) {
    pinoLogger[level](logData, message);
    return;
  }

  console.info(
    JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...logData }),
  );
}

export class RuntimeLogger {
  private readonly context: LogContext;
  private readonly pinoLogger: FastifyBaseLogger | undefined;

  constructor(
    traceId: string,
    threadId?: string,
    model?: string,
    pinoLogger?: FastifyBaseLogger,
  ) {
    this.context = {
      traceId,
      ...(threadId ? { threadId } : {}),
      ...(model ? { model } : {}),
    };
    this.pinoLogger = pinoLogger;
  }

  setRequestId(requestId: string): void {
    this.context.requestId = requestId;
  }

  logInvocationStart(data?: LogData): void {
    structureLog('info', 'agent_request_start', this.context, data, this.pinoLogger);
  }

  logInvocationEnd(durationMs: number, data?: LogData): void {
    structureLog(
      'info',
      'agent_request_end',
      this.context,
      { durationMs, ...data },
      this.pinoLogger,
    );
  }

  logInvocationError(error: unknown, data?: LogData): void {
    const sanitized = sanitizeError(error);
    structureLog(
      'error',
      'agent_request_error',
      this.context,
      { error: sanitized, ...data },
      this.pinoLogger,
    );
  }

  logToolCallStart(toolUseId: string, toolName: string, data?: LogData): void {
    structureLog(
      'info',
      'tool_call_start',
      this.context,
      { toolUseId, toolName, ...data },
      this.pinoLogger,
    );
  }

  logToolCallEnd(
    toolUseId: string,
    toolName: string,
    durationMs: number,
    data?: LogData,
  ): void {
    structureLog(
      'info',
      'tool_call_end',
      this.context,
      { toolUseId, toolName, durationMs, ...data },
      this.pinoLogger,
    );
  }

  logToolCallError(
    toolUseId: string,
    toolName: string,
    durationMs: number,
    data?: LogData,
  ): void {
    structureLog(
      'error',
      'tool_call_error',
      this.context,
      { toolUseId, toolName, durationMs, ...data },
      this.pinoLogger,
    );
  }

  logObservationSummary(data: LogData): void {
    structureLog('info', 'observation_summary', this.context, data, this.pinoLogger);
  }

  debug(message: string, data?: LogData): void {
    structureLog('debug', message, this.context, data, this.pinoLogger);
  }

  info(message: string, data?: LogData): void {
    structureLog('info', message, this.context, data, this.pinoLogger);
  }

  warn(message: string, data?: LogData): void {
    structureLog('warn', message, this.context, data, this.pinoLogger);
  }

  error(message: string, data?: LogData): void {
    structureLog('error', message, this.context, data, this.pinoLogger);
  }
}
