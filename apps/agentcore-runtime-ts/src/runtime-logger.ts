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
): void {
  const timestamp = new Date().toISOString();

  const logEntry = {
    timestamp,
    level,
    message,
    traceId: context.traceId,
    ...(context.threadId ? { threadId: context.threadId } : {}),
    ...(context.model ? { model: context.model } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(data ? data : {}),
  };

  console.info(JSON.stringify(logEntry));
}

export class RuntimeLogger {
  private readonly context: LogContext;

  constructor(traceId: string, threadId?: string, model?: string) {
    this.context = {
      traceId,
      ...(threadId ? { threadId } : {}),
      ...(model ? { model } : {}),
    };
  }

  setRequestId(requestId: string): void {
    this.context.requestId = requestId;
  }

  logInvocationStart(data?: LogData): void {
    structureLog('info', 'agent_request_start', this.context, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  logInvocationEnd(durationMs: number, data?: LogData): void {
    structureLog('info', 'agent_request_end', this.context, {
      durationMs,
      ...data,
    });
  }

  logInvocationError(error: unknown, data?: LogData): void {
    const sanitized = sanitizeError(error);
    structureLog('error', 'agent_request_error', this.context, {
      error: sanitized,
      ...data,
    });
  }

  logToolCallStart(toolUseId: string, toolName: string, data?: LogData): void {
    structureLog('info', 'tool_call_start', this.context, {
      toolUseId,
      toolName,
      ...data,
    });
  }

  logToolCallEnd(
    toolUseId: string,
    toolName: string,
    durationMs: number,
    data?: LogData,
  ): void {
    structureLog('info', 'tool_call_end', this.context, {
      toolUseId,
      toolName,
      durationMs,
      ...data,
    });
  }

  logToolCallError(
    toolUseId: string,
    toolName: string,
    durationMs: number,
    data?: LogData,
  ): void {
    structureLog('error', 'tool_call_error', this.context, {
      toolUseId,
      toolName,
      durationMs,
      ...data,
    });
  }

  logObservationSummary(data: LogData): void {
    structureLog('info', 'observation_summary', this.context, data);
  }

  debug(message: string, data?: LogData): void {
    structureLog('debug', message, this.context, data);
  }

  info(message: string, data?: LogData): void {
    structureLog('info', message, this.context, data);
  }

  warn(message: string, data?: LogData): void {
    structureLog('warn', message, this.context, data);
  }

  error(message: string, data?: LogData): void {
    structureLog('error', message, this.context, data);
  }
}
