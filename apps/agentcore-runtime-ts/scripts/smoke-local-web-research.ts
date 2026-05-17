#!/usr/bin/env tsx
/**
 * Local Web Research Agent smoke script.
 *
 * Calls createWebResearchAgent() directly — no AgentCore Runtime deployment or
 * AGENTCORE_RUNTIME_ARN required. Useful for rapid iteration on prompt, tool,
 * and structured-output design for the Web Research Agent.
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   AWS_REGION=ap-northeast-1 pnpm smoke:local:research
 *   pnpm smoke:local:research -- --prompt "最新のAI開発トレンドを調べて" --strict
 *
 * Or via justfile:
 *   just smoke-local-research
 *
 * Env vars:
 *   AWS_REGION                    (default: ap-northeast-1)
 *   BEDROCK_REGION                override Bedrock region only
 *   BEDROCK_MODEL_ID_WEB_RESEARCH Web Research Agent model id
 *   BEDROCK_MODEL_ID_SONNET       fallback model id
 *   TAVILY_API_KEY                Tavily API key (direct, highest priority)
 *   TAVILY_API_KEY_SECRET_ID      Tavily key from Secrets Manager
 *   TAVILY_API_KEY_SSM_NAME       Tavily key from SSM Parameter Store
 *
 * CLI flags:
 *   --prompt <text>      Research prompt (default: built-in sample)
 *   --model <model-id>   Override model id
 *   --region <region>    Override AWS/Bedrock region
 *   --strict             Fail on degraded response or missing research tools
 *   --timeout-ms <ms>    Agent timeout (default: 300000)
 *   --json               Print machine-readable summary as the last line
 */
import { uuidv7 } from 'uuidv7';
import { createWebResearchAgent } from '../src/agents/web-research/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT =
  '最新のAI技術トレンドについて、信頼できるソースを引用しながら説明してください。';
const DEFAULT_TIMEOUT_MS = 300_000;

const RESEARCH_TOOL_NAMES = new Set([
  'web_research',
  'tavily_search',
  'tavily_extract',
  'tavily_crawl',
  'tavily_map',
]);

const FALLBACK_PATTERNS = [
  'web_research_agentにて技術的なエラー',
  'not_configured',
  'technical error',
  'no_results',
  'fallback_recommended',
  'Web Research Agent did not return',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocalSmokeConfig = {
  readonly prompt: string;
  readonly modelId: string | undefined;
  readonly region: string;
  readonly strict: boolean;
  readonly timeoutMs: number;
  readonly json: boolean;
  readonly runId: string;
};

type ToolEntry = {
  readonly name: string;
  readonly startedAt: number;
  durationMs?: number;
  status?: 'complete' | 'error';
};

type EvidenceAccumulator = {
  sources: number;
  citations: number;
};

type SmokeSummary = {
  readonly elapsedMs: number;
  readonly status: 'success' | 'error' | 'timeout';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly sources: number;
  readonly citations: number;
  readonly toolsObserved: readonly string[];
  readonly timeline: ReadonlyArray<{
    name: string;
    durationMs: number | undefined;
    status: string;
  }>;
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): LocalSmokeConfig {
  const argv = process.argv.slice(2);
  let prompt = DEFAULT_PROMPT;
  let modelId: string | undefined;
  let region = process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1';
  let strict = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt' && argv[i + 1]) {
      prompt = argv[++i] as string;
    } else if (arg === '--model' && argv[i + 1]) {
      modelId = argv[++i];
    } else if (arg === '--region' && argv[i + 1]) {
      region = argv[++i] as string;
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (!Number.isNaN(parsed) && parsed > 0) timeoutMs = parsed;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg && !arg.startsWith('--')) {
      prompt = arg;
    }
  }

  const resolvedModelId =
    modelId ??
    process.env.BEDROCK_MODEL_ID_WEB_RESEARCH ??
    process.env.BEDROCK_MODEL_ID_SONNET;

  return {
    prompt,
    modelId: resolvedModelId,
    region,
    strict,
    timeoutMs,
    json,
    runId: uuidv7(),
  };
}

// ---------------------------------------------------------------------------
// Evidence extraction from tool results
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractEvidenceFromToolResult(
  toolName: string,
  content: ReadonlyArray<{ readonly type?: string; readonly text?: string }>,
  acc: EvidenceAccumulator,
): void {
  if (toolName !== 'web_research') return;

  for (const item of content) {
    if (!item.text) continue;
    try {
      const parsed: unknown = JSON.parse(item.text);
      if (!isRecord(parsed)) continue;

      const payload =
        parsed.status === 'success' && isRecord(parsed.data) ? parsed.data : parsed;

      if (Array.isArray(payload.sources)) {
        acc.sources += payload.sources.length;
      }
      if (Array.isArray(payload.citations)) {
        acc.citations += payload.citations.length;
      }
    } catch {
      // not JSON — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Strict mode validation
// ---------------------------------------------------------------------------

function detectFallback(text: string): string | undefined {
  return FALLBACK_PATTERNS.find((p) => text.toLowerCase().includes(p.toLowerCase()));
}

function validateStrict(
  summary: SmokeSummary,
  responseText: string,
): { ok: boolean; reason: string } {
  if (summary.status === 'error') {
    return { ok: false, reason: 'agent exited with error' };
  }
  if (summary.status === 'timeout') {
    return { ok: false, reason: 'agent timed out' };
  }

  const researchToolsFound = summary.toolsObserved.filter((t) =>
    RESEARCH_TOOL_NAMES.has(t),
  );
  if (researchToolsFound.length === 0) {
    return {
      ok: false,
      reason:
        'no research tools observed (web_research / tavily_search / tavily_extract)',
    };
  }

  const fallback = detectFallback(responseText);
  if (fallback) {
    return {
      ok: false,
      reason: `fallback/error pattern detected in response: "${fallback}"`,
    };
  }

  if (summary.sources === 0 && summary.citations === 0) {
    return {
      ok: false,
      reason:
        'research tools ran but no sources or citations were extracted — check web_research output',
    };
  }

  return { ok: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function padRight(label: string, width: number): string {
  return label.padEnd(width);
}

function printTimeline(
  timeline: ReadonlyArray<{
    name: string;
    durationMs: number | undefined;
    status: string;
  }>,
): void {
  if (timeline.length === 0) return;
  console.log('--- timeline ---');
  for (const entry of timeline) {
    const dur = entry.durationMs !== undefined ? `${entry.durationMs}ms` : 'n/a';
    console.log(
      `tool ${padRight(entry.name, 32)} ${padRight(dur, 10)} [${entry.status}]`,
    );
  }
}

function printUsage(inputTokens: number, outputTokens: number): void {
  console.log('--- usage ---');
  console.log(`inputTokens  : ${inputTokens}`);
  console.log(`outputTokens : ${outputTokens}`);
}

function printEvidence(sources: number, citations: number): void {
  console.log('--- evidence ---');
  console.log(`sources   : ${sources}`);
  console.log(`citations : ${citations}`);
}

function printSummary(config: LocalSmokeConfig, summary: SmokeSummary): void {
  console.log('--- summary ---');
  console.log(`runId     : ${config.runId}`);
  console.log(`elapsedMs : ${summary.elapsedMs}`);
  console.log(`status    : ${summary.status}`);
  if (config.json) {
    process.stdout.write('\n');
    console.log(JSON.stringify(summary));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = parseArgs();

  const resolvedModelId = config.modelId ?? 'global.anthropic.claude-sonnet-4-6';

  console.log('[local-smoke] target=web-research-agent');
  console.log(`[local-smoke] model=${resolvedModelId}`);
  console.log(`[local-smoke] region=${config.region}`);
  console.log(`[local-smoke] strict=${config.strict}`);
  console.log(`[local-smoke] prompt=${config.prompt}`);
  console.log('');
  console.log('--- response ---');

  const agent = createWebResearchAgent({
    modelConfig: {
      modelId: resolvedModelId,
      region: config.region,
    },
    printer: false,
  });

  const toolMap = new Map<string, ToolEntry>();
  const timeline: Array<{
    name: string;
    durationMs: number | undefined;
    status: string;
  }> = [];
  const toolsObserved = new Set<string>();
  const evidence: EvidenceAccumulator = { sources: 0, citations: 0 };
  let responseText = '';
  let exitedWithError = false;
  let timedOut = false;

  const startedAt = Date.now();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  let agentResult: Awaited<ReturnType<typeof agent.invoke>> | undefined;

  try {
    const stream = agent.stream(config.prompt);

    while (true) {
      if (timedOut) break;

      const { value, done } = await stream.next();

      if (done) {
        agentResult = value;
        break;
      }

      const event = value;

      // Text streaming
      if (
        event.type === 'modelStreamUpdateEvent' &&
        event.event.type === 'modelContentBlockDeltaEvent' &&
        event.event.delta.type === 'textDelta'
      ) {
        process.stdout.write(event.event.delta.text);
        responseText += event.event.delta.text;
        continue;
      }

      // Tool use start — record timing
      if (
        event.type === 'modelStreamUpdateEvent' &&
        event.event.type === 'modelContentBlockStartEvent' &&
        event.event.start?.type === 'toolUseStart'
      ) {
        const { toolUseId, name } = event.event.start;
        if (!toolMap.has(toolUseId)) {
          toolMap.set(toolUseId, { name, startedAt: Date.now() });
          toolsObserved.add(name);
        }
        continue;
      }

      // Tool use block (fallback registration if start was missed)
      if (
        event.type === 'contentBlockEvent' &&
        event.contentBlock.type === 'toolUseBlock'
      ) {
        const { toolUseId, name } = event.contentBlock;
        if (!toolMap.has(toolUseId)) {
          toolMap.set(toolUseId, { name, startedAt: Date.now() });
          toolsObserved.add(name);
        }
        continue;
      }

      // Tool result — record duration and extract evidence
      if (event.type === 'toolResultEvent') {
        const { toolUseId, status, content } = event.result;
        const entry = toolMap.get(toolUseId);
        const durationMs = entry ? Date.now() - entry.startedAt : undefined;
        const toolStatus = status === 'error' ? 'error' : 'complete';

        timeline.push({
          name: entry?.name ?? 'unknown',
          durationMs,
          status: toolStatus,
        });

        if (entry?.name) {
          extractEvidenceFromToolResult(
            entry.name,
            content as ReadonlyArray<{ type?: string; text?: string }>,
            evidence,
          );
        }

        toolMap.delete(toolUseId);
      }
    }
  } catch (error) {
    if (timedOut) {
      console.error(`\n[local-smoke] TIMEOUT: agent exceeded ${config.timeoutMs}ms`);
    } else {
      exitedWithError = true;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n[local-smoke] error: ${msg}`);
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  console.log('');

  const elapsedMs = Date.now() - startedAt;

  // Extract accumulated usage from AgentResult metrics
  const accUsage = agentResult?.metrics?.accumulatedUsage;
  const inputTokens = accUsage?.inputTokens ?? 0;
  const outputTokens = accUsage?.outputTokens ?? 0;

  const status = timedOut ? 'timeout' : exitedWithError ? 'error' : 'success';

  const summary: SmokeSummary = {
    elapsedMs,
    status,
    inputTokens,
    outputTokens,
    sources: evidence.sources,
    citations: evidence.citations,
    toolsObserved: [...toolsObserved],
    timeline,
  };

  printTimeline(timeline);
  console.log('');
  printUsage(inputTokens, outputTokens);
  console.log('');
  printEvidence(evidence.sources, evidence.citations);
  console.log('');
  printSummary(config, summary);

  if (config.strict) {
    const { ok, reason } = validateStrict(summary, responseText);
    if (!ok) {
      console.error(`[local-smoke] FAIL: strict mode — ${reason}`);
      process.exit(1);
    }
  }

  if (status !== 'success') {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    '[local-smoke] fatal:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
