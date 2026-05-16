/**
 * AgentCore Runtime log discovery script.
 *
 * Usage via just:
 *   just agentcore-logs [stage] [since=30m]
 *   just agentcore-logs-request [stage] <requestId>
 *   just agentcore-logs-session [stage] <sessionId>
 *   just agentcore-errors [stage] [since=1h]
 *   just agentcore-log-groups [stage]
 *   just agentcore-logs-follow [stage]        # tail mode
 *
 * Required IAM permissions for the calling role:
 *   logs:StartQuery, logs:GetQueryResults, logs:DescribeLogGroups
 *   on arn:aws:logs:*:*:log-group:/aws/bedrock-agentcore/runtimes/*
 *
 * Env vars:
 *   AWS_REGION / AWS_DEFAULT_REGION  (set automatically by just via aws configure export-credentials)
 *   AGENTRA_STAGE                    (alternative to passing stage positionally)
 */

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  GetQueryResultsCommand,
  QueryStatus,
  type ResultField,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOG_GROUP_PREFIX = '/aws/bedrock-agentcore/runtimes/';
const POLL_INTERVAL_MS = 15_000;
const FOLLOW_OVERLAP_SEC = 90;
const SEEN_SET_MAX = 10_000;
const DEFAULT_LIMIT = 200;
const REQUEST_SESSION_LIMIT = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

type LogMode = 'general' | 'request' | 'session' | 'errors' | 'groups';

type LogConfig = {
  readonly mode: LogMode;
  readonly stage: string;
  readonly region: string;
  readonly since: string;
  readonly filterId: string;
  readonly follow: boolean;
};

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(): LogConfig {
  const args = process.argv.slice(2);

  const rawMode = args[0] ?? 'general';
  const mode = validateMode(rawMode);
  const stage = args[1] ?? process.env.AGENTRA_STAGE ?? 'dev';
  const since = args[2] && !args[2].startsWith('--') ? args[2] : defaultSince(mode);
  const filterId = args[3] && !args[3].startsWith('--') ? args[3] : '';
  const follow = args.includes('--follow');
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'ap-northeast-1';

  return { mode, stage, region, since, filterId, follow };
}

function validateMode(raw: string): LogMode {
  const valid: LogMode[] = ['general', 'request', 'session', 'errors', 'groups'];
  if (valid.includes(raw as LogMode)) {
    return raw as LogMode;
  }
  console.error(`[agentcore-logs] Unknown mode: ${raw}. Valid: ${valid.join(', ')}`);
  process.exit(1);
}

function defaultSince(mode: LogMode): string {
  return mode === 'errors' ? '1h' : '30m';
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function parseSinceToEpochSec(since: string): number {
  const match = since.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    console.error(
      `[agentcore-logs] Invalid since format: "${since}". Use e.g. 30m, 2h, 1d`,
    );
    process.exit(1);
  }
  const value = Number(match[1]);
  const unit = match[2] as 'm' | 'h' | 'd';
  const multipliers: Record<'m' | 'h' | 'd', number> = { m: 60, h: 3600, d: 86400 };
  return Math.floor(Date.now() / 1000) - value * multipliers[unit];
}

function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ── Log group resolution ──────────────────────────────────────────────────────

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

// ── Query construction ────────────────────────────────────────────────────────

function buildQueryString(mode: LogMode, filterId: string): string {
  const base = 'fields @timestamp, @log, @logStream, @message';
  switch (mode) {
    case 'general':
      return [
        base,
        '| filter @message like /agent_request_start|agent_request_end|agent_request_error|tool_call_start|tool_call_end|tool_call_error|ERROR|WARN/',
        '| sort @timestamp desc',
        `| limit ${DEFAULT_LIMIT}`,
      ].join('\n');
    case 'request':
      return [
        base,
        `| filter @message like /${escapeRegex(filterId)}/`,
        '| sort @timestamp asc',
        `| limit ${REQUEST_SESSION_LIMIT}`,
      ].join('\n');
    case 'session':
      return [
        base,
        `| filter @message like /${escapeRegex(filterId)}/`,
        '| sort @timestamp asc',
        `| limit ${REQUEST_SESSION_LIMIT}`,
      ].join('\n');
    case 'errors':
      return [
        base,
        '| filter @message like /"level":50/ or @message like /agent_request_error/ or @message like /tool_call_error/',
        '| sort @timestamp desc',
        `| limit ${DEFAULT_LIMIT}`,
      ].join('\n');
    default:
      return base;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Output formatting ─────────────────────────────────────────────────────────

const PINO_LEVEL_MAP: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

function formatLevel(raw: unknown): string {
  if (typeof raw === 'number') {
    return (PINO_LEVEL_MAP[raw] ?? String(raw)).padEnd(5);
  }
  return String(raw ?? 'INFO')
    .toUpperCase()
    .padEnd(5);
}

function getField(row: ResultField[], name: string): string | undefined {
  return row.find((f) => f.field === name)?.value;
}

function printRow(row: ResultField[]): void {
  const ts = getField(row, '@timestamp') ?? '';
  const logGroup = getField(row, '@log') ?? '';
  const logStream = getField(row, '@logStream') ?? '';
  const message = getField(row, '@message') ?? '';

  const logGroupShort = logGroup.split('/').pop() ?? logGroup;
  const location = logStream ? `${logGroupShort}/${logStream}` : logGroupShort;

  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(message) as Record<string, unknown>;
  } catch {
    // not JSON — print raw
  }

  if (parsed) {
    const level = formatLevel(parsed.level);
    const msg = String(parsed.message ?? parsed.msg ?? '');
    const traceId =
      typeof parsed.traceId === 'string' ? ` trace=${parsed.traceId.slice(0, 8)}` : '';
    const toolName =
      typeof parsed.toolName === 'string' ? ` tool=${parsed.toolName}` : '';
    const durationMs =
      typeof parsed.durationMs === 'number' ? ` dur=${parsed.durationMs}ms` : '';
    console.log(`${ts} [${location}] ${level} ${msg}${traceId}${toolName}${durationMs}`);
  } else {
    console.log(`${ts} [${location}] ${message}`);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── CloudWatch query execution ────────────────────────────────────────────────

async function runQuery(
  client: CloudWatchLogsClient,
  logGroupNames: string[],
  queryString: string,
  startTime: number,
  endTime: number,
): Promise<{ queryId: string; results: ResultField[][] }> {
  const startCmd = new StartQueryCommand({
    logGroupNames,
    queryString,
    startTime,
    endTime,
  });
  const startResp = await client.send(startCmd);
  const queryId = startResp.queryId;
  if (!queryId) throw new Error('[agentcore-logs] StartQuery returned no queryId');

  let pollMs = 1000;
  while (true) {
    await sleep(pollMs);
    pollMs = Math.min(pollMs * 1.5, 3000);

    const getCmd = new GetQueryResultsCommand({ queryId });
    const getResp = await client.send(getCmd);

    if (getResp.status === QueryStatus.Complete) {
      return { queryId, results: getResp.results ?? [] };
    }
    if (
      getResp.status === QueryStatus.Failed ||
      getResp.status === QueryStatus.Cancelled ||
      getResp.status === QueryStatus.Timeout
    ) {
      throw new Error(`[agentcore-logs] Query ${getResp.status}: ${queryId}`);
    }
  }
}

// ── List log groups ───────────────────────────────────────────────────────────

async function listLogGroups(client: CloudWatchLogsClient): Promise<void> {
  console.log(`\nAgentCore log groups under prefix: ${LOG_GROUP_PREFIX}\n`);

  let nextToken: string | undefined;
  let found = false;

  do {
    const cmd = new DescribeLogGroupsCommand({
      logGroupNamePrefix: LOG_GROUP_PREFIX,
      ...(nextToken ? { nextToken } : {}),
    });
    const resp = await client.send(cmd);
    for (const group of resp.logGroups ?? []) {
      found = true;
      const name = group.logGroupName ?? '(unnamed)';
      const storedMb =
        group.storedBytes != null
          ? `${(Number(group.storedBytes) / 1024 / 1024).toFixed(1)} MB`
          : 'unknown size';
      const created = group.creationTime
        ? new Date(group.creationTime).toISOString()
        : '';
      console.log(`  ${name}  [${storedMb}]  created=${created}`);
    }
    nextToken = resp.nextToken;
  } while (nextToken);

  if (!found) {
    console.log('  (no log groups found)');
  }
  console.log('');
}

// ── One-shot mode ─────────────────────────────────────────────────────────────

async function runOneShot(
  client: CloudWatchLogsClient,
  config: LogConfig,
): Promise<void> {
  const logGroupNames = await discoverLogGroups(client, config.stage);
  const queryString = buildQueryString(config.mode, config.filterId);
  const startTime = parseSinceToEpochSec(config.since);
  const endTime = nowEpochSec();

  console.log(
    `\n[agentcore-logs] Querying ${config.mode} logs for stage=${config.stage} since=${config.since}`,
  );
  if (config.filterId) {
    console.log(`[agentcore-logs] Filter: ${config.filterId}`);
  }
  console.log(`[agentcore-logs] Log groups: ${logGroupNames.join(', ')}`);
  console.log('');

  const { queryId, results } = await runQuery(
    client,
    logGroupNames,
    queryString,
    startTime,
    endTime,
  );

  if (results.length === 0) {
    console.log('(no results)');
  } else {
    for (const row of results) {
      printRow(row);
    }
  }

  const region = config.region;
  console.log('');
  console.log(`query-id : ${queryId}`);
  console.log(
    `console  : https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:logs-insights`,
  );
}

// ── Follow mode ───────────────────────────────────────────────────────────────

async function runFollow(client: CloudWatchLogsClient, config: LogConfig): Promise<void> {
  const logGroupNames = await discoverLogGroups(client, config.stage);
  const queryString = buildQueryString(config.mode, config.filterId);

  console.log(
    `\n[agentcore-logs] Following ${config.mode} logs for stage=${config.stage} (Ctrl-C to stop)`,
  );
  if (config.filterId) {
    console.log(`[agentcore-logs] Filter: ${config.filterId}`);
  }
  console.log('');

  process.on('SIGINT', () => {
    console.log('\n[agentcore-logs] follow stopped');
    process.exit(0);
  });

  const seen = new Set<string>();
  let windowStartSec = parseSinceToEpochSec(config.since);

  while (true) {
    const endTime = nowEpochSec();

    try {
      const { results } = await runQuery(
        client,
        logGroupNames,
        queryString,
        windowStartSec,
        endTime,
      );

      for (const row of results) {
        const ts = getField(row, '@timestamp') ?? '';
        const logStream = getField(row, '@logStream') ?? '';
        const message = getField(row, '@message') ?? '';
        const key = `${ts}::${logStream}::${message}`;

        if (!seen.has(key)) {
          seen.add(key);
          printRow(row);
        }
      }

      // Cap seen set to avoid unbounded growth
      if (seen.size > SEEN_SET_MAX) {
        const toDelete = seen.size - SEEN_SET_MAX;
        let deleted = 0;
        for (const entry of seen) {
          if (deleted >= toDelete) break;
          seen.delete(entry);
          deleted++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agentcore-logs] query error: ${msg}`);
    }

    // Advance window with overlap to avoid missing delayed events
    windowStartSec = Math.max(windowStartSec, endTime - FOLLOW_OVERLAP_SEC);
    await sleep(POLL_INTERVAL_MS);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  const client = new CloudWatchLogsClient({ region: config.region });

  if (config.mode === 'groups') {
    await listLogGroups(client);
    return;
  }

  if (config.follow) {
    await runFollow(client, config);
  } else {
    await runOneShot(client, config);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[agentcore-logs] fatal: ${msg}`);
  process.exit(1);
});
