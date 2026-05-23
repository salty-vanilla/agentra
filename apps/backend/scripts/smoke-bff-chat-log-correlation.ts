#!/usr/bin/env tsx
/**
 * BFF /chat smoke + requestId log correlation.
 *
 * Runs the BFF SSE smoke, captures done.requestId, then polls CloudWatch Logs
 * to verify that the AgentCore Runtime emitted agent_request_start and
 * agent_request_end (or agent_request_error) with the same requestId.
 *
 * Use this to confirm end-to-end requestId propagation through
 * API Gateway → Lambda Web Adapter → BFF → AgentCore Runtime → CloudWatch.
 *
 * Usage:
 *   just outputs-env <stage> bff-smoke
 *   just smoke-bff-chat-logs <stage> <profile>
 *
 * Env vars (BFF smoke):
 *   AGENTRA_STREAMING_API_BASE_URL  (required)
 *   AGENTRA_AUTH_TOKEN              (required for auth-enabled envs)
 *   SMOKE_PROMPT                    (optional)
 *   SMOKE_TIMEOUT_MS                (default: 300000)
 *
 * Env vars (log correlation):
 *   AWS_REGION / AWS_DEFAULT_REGION  (default: ap-northeast-1)
 *   AGENTRA_STAGE                    (required; set automatically by just)
 *   SMOKE_LOG_WAIT_SECONDS           (default: 60) initial wait before first poll
 *   SMOKE_LOG_POLL_INTERVAL_SECONDS  (default: 10)
 *   SMOKE_LOG_MAX_WAIT_SECONDS       (default: 180) total poll budget
 *
 * Exit codes:
 *   0 — requestId found in CloudWatch with agent_request_start + end/error
 *   1 — smoke failed or log correlation timed out
 *
 * IAM permissions required:
 *   logs:StartQuery, logs:GetQueryResults, logs:DescribeLogGroups
 *   on arn:aws:logs:*:*:log-group:/aws/bedrock-agentcore/runtimes/*
 */

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  GetQueryResultsCommand,
  QueryStatus,
  type ResultField,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { readBffSmokeConfig, runBffSmoke } from './smoke-bff-chat-core.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const TAG = '[smoke:bff-chat-log-correlation]';
const LOG_GROUP_PREFIX = '/aws/bedrock-agentcore/runtimes/';
const REQUIRED_LOG_EVENTS = ['agent_request_start'] as const;
const TERMINAL_LOG_EVENTS = ['agent_request_end', 'agent_request_error'] as const;

// ── Config ────────────────────────────────────────────────────────────────────

type CorrelationConfig = {
  readonly region: string;
  readonly stage: string;
  readonly initialWaitSec: number;
  readonly pollIntervalSec: number;
  readonly maxWaitSec: number;
};

function readCorrelationConfig(): CorrelationConfig {
  const stage = process.env.AGENTRA_STAGE?.trim();
  if (!stage) {
    throw new Error(
      `${TAG} Missing required env var: AGENTRA_STAGE\n` +
        `  Set via: AGENTRA_STAGE=dev just smoke-bff-chat-logs dev`,
    );
  }
  return {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-northeast-1',
    stage,
    initialWaitSec: Number(process.env.SMOKE_LOG_WAIT_SECONDS) || 60,
    pollIntervalSec: Number(process.env.SMOKE_LOG_POLL_INTERVAL_SECONDS) || 10,
    maxWaitSec: Number(process.env.SMOKE_LOG_MAX_WAIT_SECONDS) || 180,
  };
}

// ── CloudWatch helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverLogGroups(
  client: CloudWatchLogsClient,
  stage: string,
): Promise<string[]> {
  const groups: string[] = [];
  let nextToken: string | undefined;
  do {
    const resp = await client.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: LOG_GROUP_PREFIX,
        limit: 50,
        ...(nextToken ? { nextToken } : {}),
      }),
    );
    for (const group of resp.logGroups ?? []) {
      if (group.logGroupName?.includes(`-${stage}`)) {
        groups.push(group.logGroupName);
      }
    }
    nextToken = resp.nextToken;
  } while (nextToken);

  return groups.length > 0
    ? groups
    : [
        `${LOG_GROUP_PREFIX}agentcore-${stage}`,
        `${LOG_GROUP_PREFIX}agentra-slide-${stage}`,
      ];
}

function getField(row: ResultField[], name: string): string | undefined {
  return row.find((f) => f.field === name)?.value;
}

async function queryLogsByRequestId(
  client: CloudWatchLogsClient,
  logGroupNames: string[],
  requestId: string,
  startTime: number,
  endTime: number,
): Promise<ResultField[][]> {
  const escaped = requestId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const queryString = [
    'fields @timestamp, @logStream, @message',
    `| filter @message like /${escaped}/`,
    '| sort @timestamp asc',
    '| limit 200',
  ].join('\n');

  const startResp = await client.send(
    new StartQueryCommand({
      logGroupNames,
      queryString,
      startTime,
      endTime,
    }),
  );
  const queryId = startResp.queryId;
  if (!queryId) throw new Error(`${TAG} StartQuery returned no queryId`);

  let pollMs = 1000;
  while (true) {
    await sleep(pollMs);
    pollMs = Math.min(pollMs * 1.5, 3000);

    const resp = await client.send(new GetQueryResultsCommand({ queryId }));
    if (resp.status === QueryStatus.Complete) {
      return resp.results ?? [];
    }
    if (
      resp.status === QueryStatus.Failed ||
      resp.status === QueryStatus.Cancelled ||
      resp.status === QueryStatus.Timeout
    ) {
      throw new Error(`${TAG} CloudWatch query ${resp.status}: ${queryId}`);
    }
  }
}

// ── Log correlation ───────────────────────────────────────────────────────────

type CorrelationResult = {
  readonly foundStart: boolean;
  readonly foundEnd: boolean;
  readonly rows: ResultField[][];
};

async function correlateRequestId(
  requestId: string,
  smokeStartEpochSec: number,
  config: CorrelationConfig,
): Promise<CorrelationResult> {
  const client = new CloudWatchLogsClient({ region: config.region });
  const logGroupNames = await discoverLogGroups(client, config.stage);

  console.log(`${TAG} log groups: ${logGroupNames.join(', ')}`);
  console.log(`${TAG} waiting ${config.initialWaitSec}s for logs to propagate...`);

  await sleep(config.initialWaitSec * 1000);

  const deadline = Date.now() + config.maxWaitSec * 1000;
  let foundStart = false;
  let foundEnd = false;
  let lastRows: ResultField[][] = [];

  while (Date.now() < deadline) {
    const endTime = Math.floor(Date.now() / 1000) + 60;
    const rows = await queryLogsByRequestId(
      client,
      logGroupNames,
      requestId,
      smokeStartEpochSec,
      endTime,
    );
    lastRows = rows;

    foundStart = false;
    foundEnd = false;
    for (const row of rows) {
      const msg = getField(row, '@message') ?? '';
      if (msg.includes('agent_request_start')) foundStart = true;
      for (const terminal of TERMINAL_LOG_EVENTS) {
        if (msg.includes(terminal)) foundEnd = true;
      }
    }

    if (foundStart && foundEnd) break;

    if (Date.now() < deadline) {
      console.log(
        `${TAG} polling again in ${config.pollIntervalSec}s ` +
          `(found start=${foundStart} end=${foundEnd}, rows=${rows.length})`,
      );
      await sleep(config.pollIntervalSec * 1000);
    }
  }

  return { foundStart, foundEnd, rows: lastRows };
}

function printRows(rows: ResultField[]): void {
  const ts = getField(rows, '@timestamp') ?? '';
  const logStream = getField(rows, '@logStream') ?? '';
  const message = getField(rows, '@message') ?? '';

  const streamShort = logStream.split('/').slice(-1)[0] ?? logStream;

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(message) as Record<string, unknown>;
  } catch {
    // raw message
  }

  if (parsed) {
    const msg = String(parsed.message ?? parsed.msg ?? '');
    const durationMs =
      typeof parsed.durationMs === 'number' ? ` dur=${parsed.durationMs}ms` : '';
    // Print only structured metadata — never raw prompt/response content
    console.log(`  ${ts} [${streamShort}] ${msg}${durationMs}`);
  } else {
    console.log(`  ${ts} [${streamShort}] ${message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bffConfig = readBffSmokeConfig();
  const correlationConfig = readCorrelationConfig();

  console.log(
    `${TAG} stage=${correlationConfig.stage} region=${correlationConfig.region}`,
  );
  console.log('');

  // Step 1: run BFF smoke and capture requestId
  const smokeStartEpochSec = Math.floor(Date.now() / 1000) - 30; // 30s buffer for clock skew
  console.log(`${TAG} --- BFF SSE smoke ---`);
  const smokeResult = await runBffSmoke(bffConfig);
  console.log('');

  const { requestId, traceId } = smokeResult;
  console.log(`${TAG} --- CloudWatch log correlation ---`);
  console.log(`${TAG} searching for requestId=${requestId}`);
  if (traceId) console.log(`${TAG} traceId=${traceId}`);

  // Step 2: poll CloudWatch for the requestId
  const correlation = await correlateRequestId(
    requestId,
    smokeStartEpochSec,
    correlationConfig,
  );

  // Step 3: print matching log rows (metadata only, no raw content)
  if (correlation.rows.length > 0) {
    console.log(`\n${TAG} matching log entries (${correlation.rows.length}):`);
    for (const row of correlation.rows) {
      printRows(row);
    }
  } else {
    console.log(`${TAG} no log entries found for requestId=${requestId}`);
  }

  // Step 4: validate required log events
  const missing: string[] = [];
  for (const required of REQUIRED_LOG_EVENTS) {
    const found = correlation.rows.some((row) =>
      (getField(row, '@message') ?? '').includes(required),
    );
    if (!found) missing.push(required);
  }

  const hasTerminal = TERMINAL_LOG_EVENTS.some((t) =>
    correlation.rows.some((row) => (getField(row, '@message') ?? '').includes(t)),
  );
  if (!hasTerminal) missing.push('agent_request_end|agent_request_error');

  console.log('');
  console.log(
    `${TAG} foundStart=${correlation.foundStart} foundEnd=${correlation.foundEnd}`,
  );

  if (missing.length > 0) {
    console.error(`${TAG} status=failed — missing log events: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`${TAG} status=success`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
