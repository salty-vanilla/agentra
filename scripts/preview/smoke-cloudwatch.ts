/**
 * Side-effecting CloudWatch Logs search for the `bff.chatLogCorrelation` check.
 *
 * Kept thin and deliberately not unit-tested (mirrors smoke-runtime.ts): the
 * pure pass/fail decision lives in `evaluateLogCorrelation` (smoke-checks.ts) and
 * the result shaping in smoke-report.ts. This module only runs Logs Insights
 * queries and reduces the rows to structured booleans — it never returns or logs
 * raw log message text.
 */
import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  QueryStatus,
  type ResultField,
  StartQueryCommand,
  StopQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import type {
  CloudWatchLogCorrelationParams,
  CloudWatchLogCorrelationResult,
} from './run-smoke.js';

const REQUEST_START_MARKER = 'agent_request_start';
const REQUEST_END_MARKER = 'agent_request_end';
const REQUEST_ERROR_MARKER = 'agent_request_error';

/** Bound a single Logs Insights GetQueryResults poll loop so it cannot hang. */
const QUERY_POLL_INITIAL_MS = 1_000;
const QUERY_POLL_MAX_MS = 3_000;
const QUERY_END_BUFFER_SEC = 60;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fieldValue(row: ResultField[], name: string): string | undefined {
  return row.find((field) => field.field === name)?.value;
}

/** `@log` is `<accountId>:<logGroupName>`; return just the log group name. */
function logGroupFromLogField(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

interface RowFlags {
  sawRequestStart: boolean;
  sawRequestEnd: boolean;
  sawRequestError: boolean;
  matchedLogGroupNames: string[];
}

/**
 * Reduce result rows to the structured markers we care about. Only the `@message`
 * marker substrings and the originating log group are inspected; message bodies
 * are never retained.
 */
function inspectRows(rows: ResultField[][]): RowFlags {
  const matched = new Set<string>();
  let sawRequestStart = false;
  let sawRequestEnd = false;
  let sawRequestError = false;

  for (const row of rows) {
    const message = fieldValue(row, '@message') ?? '';
    const group = logGroupFromLogField(fieldValue(row, '@log'));
    if (group) {
      matched.add(group);
    }
    if (message.includes(REQUEST_START_MARKER)) sawRequestStart = true;
    if (message.includes(REQUEST_END_MARKER)) sawRequestEnd = true;
    if (message.includes(REQUEST_ERROR_MARKER)) sawRequestError = true;
  }

  return {
    sawRequestStart,
    sawRequestEnd,
    sawRequestError,
    matchedLogGroupNames: [...matched],
  };
}

/**
 * Run one Logs Insights query filtering by the (regex-escaped) requestId.
 *
 * Returns `null` when the overall `deadlineMs` poll budget is exhausted while the
 * query is still Scheduled/Running — in that case the in-flight query is stopped
 * (best effort) so the caller can report a clean timeout instead of hanging on a
 * slow/stuck CloudWatch query.
 */
async function runInsightsQuery(
  client: CloudWatchLogsClient,
  logGroupNames: string[],
  requestId: string,
  startTimeSec: number,
  deadlineMs: number,
): Promise<ResultField[][] | null> {
  const escaped = requestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const queryString = [
    'fields @timestamp, @log, @message',
    `| filter @message like /${escaped}/`,
    '| sort @timestamp asc',
    '| limit 200',
  ].join('\n');

  const startResp = await client.send(
    new StartQueryCommand({
      logGroupNames,
      queryString,
      startTime: startTimeSec,
      endTime: Math.floor(Date.now() / 1000) + QUERY_END_BUFFER_SEC,
    }),
  );
  const queryId = startResp.queryId;
  if (!queryId) {
    throw new Error('CloudWatch StartQuery returned no queryId');
  }

  let pollMs = QUERY_POLL_INITIAL_MS;
  while (true) {
    if (Date.now() >= deadlineMs) {
      // Best-effort: stop the in-flight query so it does not keep running server
      // side, then signal timeout to the caller.
      try {
        await client.send(new StopQueryCommand({ queryId }));
      } catch {
        // ignore — the query may already be complete/failed
      }
      return null;
    }
    await sleep(pollMs);
    pollMs = Math.min(pollMs * 1.5, QUERY_POLL_MAX_MS);
    const resp = await client.send(new GetQueryResultsCommand({ queryId }));
    if (resp.status === QueryStatus.Complete) {
      return resp.results ?? [];
    }
    if (
      resp.status === QueryStatus.Failed ||
      resp.status === QueryStatus.Cancelled ||
      resp.status === QueryStatus.Timeout
    ) {
      throw new Error(`CloudWatch query ${resp.status}`);
    }
  }
}

/**
 * Poll CloudWatch Logs for the requestId until both `agent_request_start` and a
 * terminal (`agent_request_end`/`agent_request_error`) marker appear, or the
 * `timeoutMs` poll budget is exhausted. CloudWatch ingestion lags the request, so
 * we retry every `pollIntervalMs`.
 */
export async function searchCloudWatchLogsByRequestId(
  params: CloudWatchLogCorrelationParams,
): Promise<CloudWatchLogCorrelationResult> {
  const { requestId, region, logGroupNames, startTimeMs, timeoutMs, pollIntervalMs } =
    params;
  const client = new CloudWatchLogsClient(region ? { region } : {});
  const start = Date.now();
  const deadline = start + timeoutMs;
  const startTimeSec = Math.floor(startTimeMs / 1000);

  let lastFlags: RowFlags = {
    sawRequestStart: false,
    sawRequestEnd: false,
    sawRequestError: false,
    matchedLogGroupNames: [],
  };

  try {
    while (true) {
      const rows = await runInsightsQuery(
        client,
        logGroupNames,
        requestId,
        startTimeSec,
        deadline,
      );
      if (rows === null) {
        // Inner query exhausted the deadline while still running.
        return { ...lastFlags, ok: false, latencyMs: Date.now() - start, timedOut: true };
      }
      lastFlags = inspectRows(rows);
      const sawTerminal = lastFlags.sawRequestEnd || lastFlags.sawRequestError;

      if (lastFlags.sawRequestStart && sawTerminal) {
        return { ...lastFlags, ok: true, latencyMs: Date.now() - start, timedOut: false };
      }
      if (Date.now() + pollIntervalMs >= deadline) {
        return { ...lastFlags, ok: false, latencyMs: Date.now() - start, timedOut: true };
      }
      await sleep(pollIntervalMs);
    }
  } catch (error) {
    return {
      ...lastFlags,
      ok: false,
      latencyMs: Date.now() - start,
      timedOut: false,
      error: errorMessage(error),
    };
  }
}
