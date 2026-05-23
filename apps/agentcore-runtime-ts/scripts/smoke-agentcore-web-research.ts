#!/usr/bin/env tsx
/**
 * Live AgentCore Web Research Agent smoke script.
 *
 * Calls the deployed AgentCore Runtime directly to verify the Web Research Agent
 * path: invoke_web_research_agent → web_research → strands_structured_output.
 *
 * This script specifically targets the failure mode seen in production where
 * invoke_web_research_agent / tavily_search / strands_structured_output fail
 * while returning a graceful fallback response — which plain chat smoke
 * would not catch.
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   AWS_REGION=ap-northeast-1 AGENTCORE_RUNTIME_ARN=arn:... pnpm smoke:agentcore:research
 *   SMOKE_STRICT=true ... pnpm smoke:agentcore:research
 *
 * Env vars:
 *   AWS_REGION                    (default: ap-northeast-1)
 *   AGENTCORE_RUNTIME_ARN         (required)
 *   AGENTCORE_RUNTIME_QUALIFIER   (optional)
 *   SMOKE_MODEL                   opus|sonnet|haiku (default: sonnet)
 *   SMOKE_USER_ID                 (default: smoke-user-local)
 *   SMOKE_THREAD_ID               (default: generated uuidv7)
 *   SMOKE_TRACE_ID                (default: generated uuidv7)
 *   SMOKE_TIMEOUT_MS              (default: 300000)
 *   SMOKE_STRICT                  true to fail if no research tools observed or fallback detected
 */
import {
  accumulateEvent,
  buildPayload,
  initialStats,
  parseArgs,
  printSummary,
  readConfig,
  streamRuntime,
} from './smoke-utils.js';

const DEFAULT_PROMPT =
  '最新のAI技術トレンドについて、信頼できるソースを引用しながら説明してください。';

const RESEARCH_TOOL_NAMES = new Set([
  'invoke_web_research_agent',
  'web_research',
  'tavily_search',
  'tavily_extract',
]);

const FALLBACK_PATTERNS = [
  'Web Research Agent did not return a usable handoff payload',
  'Web検索エージェントにて技術的なエラー',
  'not_configured',
  'technical error',
  'no_results',
  'fallback_recommended',
];

function detectFallback(text: string): string | undefined {
  return FALLBACK_PATTERNS.find((pattern) =>
    text.toLowerCase().includes(pattern.toLowerCase()),
  );
}

function parseStructuredSummary(responseText: string):
  | {
      usedSourceIds: string[];
      selectedModelId?: string;
      sourceCount?: number;
      citationCount?: number;
    }
  | undefined {
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const metadataSummary =
      parsed.metadataSummary && typeof parsed.metadataSummary === 'object'
        ? (parsed.metadataSummary as Record<string, unknown>)
        : undefined;
    const usedSourceIds = Array.isArray(parsed.usedSourceIds)
      ? parsed.usedSourceIds.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (
      usedSourceIds.length === 0 &&
      typeof metadataSummary?.selectedModelId !== 'string' &&
      typeof metadataSummary?.sourceCount !== 'number' &&
      typeof metadataSummary?.citationCount !== 'number'
    ) {
      return undefined;
    }

    return {
      usedSourceIds,
      ...(typeof metadataSummary?.selectedModelId === 'string'
        ? { selectedModelId: metadataSummary.selectedModelId }
        : {}),
      ...(typeof metadataSummary?.sourceCount === 'number'
        ? { sourceCount: metadataSummary.sourceCount }
        : {}),
      ...(typeof metadataSummary?.citationCount === 'number'
        ? { citationCount: metadataSummary.citationCount }
        : {}),
    };
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const baseConfig = readConfig('AGENTCORE_RUNTIME_ARN');
  const { prompt, config } = parseArgs(DEFAULT_PROMPT, baseConfig);

  console.log('[smoke] target=main-runtime (web-research path)');
  console.log(`[smoke] strict=${config.strict}`);
  console.log(`[smoke] prompt=${prompt}`);
  console.log('');
  console.log('--- response ---');

  const payload = buildPayload(config, prompt);
  let stats = initialStats();
  let gotDone = false;
  let responseText = '';

  for await (const event of streamRuntime(config, payload)) {
    stats = accumulateEvent(stats, event);
    if (event.type === 'text') {
      process.stdout.write(event.text);
      responseText += event.text;
    } else if (event.type === 'observation') {
      const tools = event.observation.toolCalls.map((tc) => tc.toolName).join(', ');
      console.log(
        `\n[observation] status=${event.observation.status} durationMs=${event.observation.durationMs} tools=${tools || '(none)'}`,
      );
    } else if (event.type === 'done') {
      gotDone = true;
    } else if (event.type === 'error') {
      console.error(`\n[error] ${event.error}`);
    }
  }

  console.log('');

  const observedTools = [...stats.toolNames];
  const researchToolsFound = observedTools.filter((t) => RESEARCH_TOOL_NAMES.has(t));
  const strandsStructuredOutputFound = observedTools.includes(
    'strands_structured_output',
  );
  const fallbackPattern = detectFallback(responseText);
  const structuredSummary = parseStructuredSummary(responseText);

  console.log('--- tool analysis ---');
  console.log(
    `research tools observed    : ${researchToolsFound.length > 0 ? researchToolsFound.join(', ') : '(none)'}`,
  );
  console.log(
    `strands_structured_output  : ${strandsStructuredOutputFound ? 'yes' : 'no'}`,
  );
  console.log(
    `fallback/error pattern     : ${fallbackPattern ? `"${fallbackPattern}"` : '(none)'}`,
  );
  if (structuredSummary) {
    console.log(
      `usedSourceIds             : ${structuredSummary.usedSourceIds.length > 0 ? structuredSummary.usedSourceIds.join(', ') : '(none)'}`,
    );
    console.log(
      `selected model id         : ${structuredSummary.selectedModelId ?? '(unknown)'}`,
    );
    console.log(
      `source/citation counts    : ${structuredSummary.sourceCount ?? '(unknown)'} / ${structuredSummary.citationCount ?? '(unknown)'}`,
    );
  }

  printSummary(config, stats);

  const runtimeFailed = !gotDone || stats.eventCounts.error > 0;
  const noResearchTools = researchToolsFound.length === 0;
  const fallbackDetected = fallbackPattern !== undefined;

  if (runtimeFailed) {
    console.error('[smoke] FAIL: runtime error or no done event');
    process.exit(1);
  }

  if (config.strict) {
    if (noResearchTools) {
      console.error(
        '[smoke] FAIL: strict mode - no research tools observed (invoke_web_research_agent / web_research / tavily_search)',
      );
      process.exit(1);
    }
    if (!structuredSummary) {
      console.error(
        '[smoke] FAIL: strict mode - final response did not include metadataSummary/usedSourceIds payload',
      );
      process.exit(1);
    }
    if (fallbackDetected) {
      console.error(
        `[smoke] FAIL: strict mode - fallback/error pattern detected in response: "${fallbackPattern}"`,
      );
      process.exit(1);
    }
    if (!noResearchTools && !strandsStructuredOutputFound) {
      console.error(
        '[smoke] FAIL: strict mode - research tools observed but strands_structured_output was NOT — JSON parse failure likely',
      );
      process.exit(1);
    }
  }
}

main().catch((error: unknown) => {
  console.error('[smoke] fatal:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
