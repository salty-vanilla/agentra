#!/usr/bin/env tsx
/**
 * Profile manufacturing-line agent internal latency (issue #138).
 *
 * Subscribes to agent stream events to attribute wall-clock time across:
 *   - LLM rounds (Before/AfterModelCallEvent)
 *   - Tool executions (Before/AfterToolCallEvent)
 *
 * Usage:
 *   eval "$(aws configure export-credentials --profile quick-admin --format env)"
 *   pnpm --filter @agentra/agentcore-runtime-ts profile:manufacturing-line
 *   pnpm --filter @agentra/agentcore-runtime-ts profile:manufacturing-line "別の質問"
 *
 * Env:
 *   BEDROCK_KB_ID                  — required for KB retrieval
 *   BEDROCK_KB_REGION / AWS_REGION
 *   BEDROCK_MODEL_ID_SONNET        — model override
 *   PROFILE_OUTPUT_JSON            — write full timeline JSON to this path
 *   PROFILE_MODE                   — handoff mode (default: auto)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createManufacturingLineAgent } from '../src/agents/manufacturing-line/agent.js';
import {
  buildManufacturingLineAgentHandoffPrompt,
  type ManufacturingLineAgentHandoffInput,
  manufacturingLineAgentHandoffOutputSchema,
} from '../src/agents/manufacturing-line/handoff.js';

const DEFAULT_QUESTION = '温度異常エラー発生時の対応手順を教えてください';

type ModelPhase = {
  kind: 'model';
  index: number;
  startedAtMs: number;
  endedAtMs?: number;
  projectedInputTokens?: number;
  stopReason?: string;
  error?: string;
};

type ToolPhase = {
  kind: 'tool';
  index: number;
  toolUseId: string;
  toolName: string;
  startedAtMs: number;
  endedAtMs?: number;
  status?: 'success' | 'error';
  error?: string;
};

type Phase = ModelPhase | ToolPhase;

function pad(
  value: string | number,
  width: number,
  align: 'left' | 'right' = 'right',
): string {
  const text = String(value);
  if (text.length >= width) return text;
  const padding = ' '.repeat(width - text.length);
  return align === 'left' ? text + padding : padding + text;
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return pad('-', 9);
  if (ms < 1000) return pad(`${ms.toFixed(0)}ms`, 9);
  return pad(`${(ms / 1000).toFixed(2)}s`, 9);
}

function formatPct(part: number, total: number): string {
  if (total <= 0) return pad('-', 7);
  return pad(`${((part / total) * 100).toFixed(1)}%`, 7);
}

function durationMs(phase: Phase): number {
  if (phase.endedAtMs === undefined) return 0;
  return phase.endedAtMs - phase.startedAtMs;
}

function printTimeline(phases: Phase[], totalMs: number): void {
  console.log('');
  console.log('=== Timeline (chronological) ===');
  console.log(
    `${pad('#', 3)}  ${pad('kind', 6, 'left')}  ${pad('name / round', 26, 'left')}  ${pad('start', 9)}  ${pad('dur', 9)}  ${pad('pct', 7)}  notes`,
  );
  console.log('-'.repeat(96));
  for (const [idx, phase] of phases.entries()) {
    const dur = durationMs(phase);
    const startLabel = formatMs(phase.startedAtMs);
    const durLabel = formatMs(dur);
    const pctLabel = formatPct(dur, totalMs);
    if (phase.kind === 'model') {
      const notes: string[] = [];
      if (phase.projectedInputTokens !== undefined) {
        notes.push(`in≈${phase.projectedInputTokens}tok`);
      }
      if (phase.stopReason) notes.push(`stop=${phase.stopReason}`);
      if (phase.error) notes.push(`error=${phase.error.slice(0, 40)}`);
      console.log(
        `${pad(idx + 1, 3)}  ${pad('model', 6, 'left')}  ${pad(`round #${phase.index}`, 26, 'left')}  ${startLabel}  ${durLabel}  ${pctLabel}  ${notes.join(', ')}`,
      );
    } else {
      const notes: string[] = [];
      if (phase.status) notes.push(phase.status);
      if (phase.error) notes.push(`error=${phase.error.slice(0, 40)}`);
      console.log(
        `${pad(idx + 1, 3)}  ${pad('tool', 6, 'left')}  ${pad(phase.toolName, 26, 'left')}  ${startLabel}  ${durLabel}  ${pctLabel}  ${notes.join(', ')}`,
      );
    }
  }
}

function printAggregates(phases: Phase[], totalMs: number): void {
  const modelPhases = phases.filter((p): p is ModelPhase => p.kind === 'model');
  const toolPhases = phases.filter((p): p is ToolPhase => p.kind === 'tool');

  const modelTotal = modelPhases.reduce((sum, p) => sum + durationMs(p), 0);
  const toolTotal = toolPhases.reduce((sum, p) => sum + durationMs(p), 0);
  const otherMs = Math.max(0, totalMs - modelTotal - toolTotal);

  console.log('');
  console.log('=== Phase aggregates ===');
  console.log(
    `${pad('phase', 22, 'left')}  ${pad('count', 6)}  ${pad('total', 9)}  ${pad('pct', 7)}  ${pad('avg', 9)}`,
  );
  console.log('-'.repeat(60));
  console.log(
    `${pad('LLM rounds', 22, 'left')}  ${pad(modelPhases.length, 6)}  ${formatMs(modelTotal)}  ${formatPct(modelTotal, totalMs)}  ${formatMs(modelPhases.length ? modelTotal / modelPhases.length : 0)}`,
  );
  console.log(
    `${pad('tool executions', 22, 'left')}  ${pad(toolPhases.length, 6)}  ${formatMs(toolTotal)}  ${formatPct(toolTotal, totalMs)}  ${formatMs(toolPhases.length ? toolTotal / toolPhases.length : 0)}`,
  );
  console.log(
    `${pad('other (overhead)', 22, 'left')}  ${pad('-', 6)}  ${formatMs(otherMs)}  ${formatPct(otherMs, totalMs)}  ${pad('-', 9)}`,
  );

  const byTool = new Map<string, { count: number; totalMs: number; errors: number }>();
  for (const phase of toolPhases) {
    const entry = byTool.get(phase.toolName) ?? { count: 0, totalMs: 0, errors: 0 };
    entry.count += 1;
    entry.totalMs += durationMs(phase);
    if (phase.status === 'error') entry.errors += 1;
    byTool.set(phase.toolName, entry);
  }
  const ranked = [...byTool.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);

  console.log('');
  console.log('=== Per-tool aggregate (sorted by total ms) ===');
  console.log(
    `${pad('tool', 32, 'left')}  ${pad('count', 6)}  ${pad('total', 9)}  ${pad('pct', 7)}  ${pad('avg', 9)}  ${pad('errors', 7)}`,
  );
  console.log('-'.repeat(82));
  for (const [name, entry] of ranked) {
    console.log(
      `${pad(name, 32, 'left')}  ${pad(entry.count, 6)}  ${formatMs(entry.totalMs)}  ${formatPct(entry.totalMs, totalMs)}  ${formatMs(entry.totalMs / entry.count)}  ${pad(entry.errors, 7)}`,
    );
  }
}

function findOpenPhase<T extends Phase['kind']>(
  phases: Phase[],
  kind: T,
  predicate?: (p: Extract<Phase, { kind: T }>) => boolean,
): Extract<Phase, { kind: T }> | undefined {
  for (let i = phases.length - 1; i >= 0; i -= 1) {
    const phase = phases[i];
    if (!phase || phase.kind !== kind || phase.endedAtMs !== undefined) continue;
    const candidate = phase as Extract<Phase, { kind: T }>;
    if (!predicate || predicate(candidate)) return candidate;
  }
  return undefined;
}

async function main(): Promise<void> {
  const question = process.argv[2]?.trim() || DEFAULT_QUESTION;
  const mode = (process.env.PROFILE_MODE ??
    'auto') as ManufacturingLineAgentHandoffInput['mode'];
  const outputJsonPath = process.env.PROFILE_OUTPUT_JSON;

  console.log('=== Manufacturing-Line Agent Profiler ===');
  console.log(`question : ${question}`);
  console.log(`mode     : ${mode ?? 'auto'}`);
  console.log(
    `model    : ${process.env.BEDROCK_MODEL_ID_SONNET ?? '(default sonnet 4.6)'}`,
  );
  console.log(
    `KB ID    : ${process.env.BEDROCK_KB_ID ?? '(unset — KB calls will fail)'}`,
  );
  console.log('---');

  const agent = createManufacturingLineAgent();
  const input: ManufacturingLineAgentHandoffInput = {
    question,
    ...(mode ? { mode } : {}),
    requireCitations: true,
  };
  const prompt = buildManufacturingLineAgentHandoffPrompt(input);

  const phases: Phase[] = [];
  let modelRoundCount = 0;
  let toolCount = 0;
  let invocationStartedAt = 0;
  let invocationEndedAt = 0;
  let finalStopReason: string | undefined;
  let finalError: string | undefined;

  invocationStartedAt = performance.now();
  const stream = agent.stream(prompt, {
    structuredOutputSchema: manufacturingLineAgentHandoffOutputSchema,
  });

  while (true) {
    let next: IteratorResult<unknown, unknown>;
    try {
      next = await stream.next();
    } catch (error) {
      finalError = error instanceof Error ? error.message : String(error);
      break;
    }
    if (next.done) {
      invocationEndedAt = performance.now();
      const result = next.value as { stopReason?: string } | undefined;
      finalStopReason = result?.stopReason;
      break;
    }
    const event = next.value as { type: string; [key: string]: unknown };
    const nowOffset = performance.now() - invocationStartedAt;
    switch (event.type) {
      case 'beforeModelCallEvent': {
        modelRoundCount += 1;
        const projected = (event as { projectedInputTokens?: number })
          .projectedInputTokens;
        const phase: ModelPhase = {
          kind: 'model',
          index: modelRoundCount,
          startedAtMs: nowOffset,
          ...(projected !== undefined ? { projectedInputTokens: projected } : {}),
        };
        phases.push(phase);
        break;
      }
      case 'afterModelCallEvent': {
        const phase = findOpenPhase(phases, 'model');
        if (phase) {
          phase.endedAtMs = nowOffset;
          const stopData = (event as { stopData?: { stopReason?: string } }).stopData;
          if (stopData?.stopReason) phase.stopReason = stopData.stopReason;
          const err = (event as { error?: { message?: string } }).error;
          if (err?.message) phase.error = err.message;
        }
        break;
      }
      case 'beforeToolCallEvent': {
        toolCount += 1;
        const toolUse = (
          event as unknown as { toolUse: { toolUseId: string; name: string } }
        ).toolUse;
        phases.push({
          kind: 'tool',
          index: toolCount,
          toolUseId: toolUse.toolUseId,
          toolName: toolUse.name,
          startedAtMs: nowOffset,
        });
        break;
      }
      case 'afterToolCallEvent': {
        const toolUse = (event as unknown as { toolUse: { toolUseId: string } }).toolUse;
        const phase = findOpenPhase(
          phases,
          'tool',
          (p) => p.toolUseId === toolUse.toolUseId,
        );
        if (phase) {
          phase.endedAtMs = nowOffset;
          const result = (event as { result?: { status?: 'success' | 'error' } }).result;
          phase.status = result?.status === 'error' ? 'error' : 'success';
          const err = (event as { error?: { message?: string } }).error;
          if (err?.message) phase.error = err.message;
        }
        break;
      }
      default:
        break;
    }
  }

  if (invocationEndedAt === 0) invocationEndedAt = performance.now();
  const totalMs = invocationEndedAt - invocationStartedAt;

  for (const phase of phases) {
    if (phase.endedAtMs === undefined) phase.endedAtMs = totalMs;
  }

  console.log(`total elapsed: ${formatMs(totalMs).trim()}`);
  if (finalStopReason) console.log(`final stop  : ${finalStopReason}`);
  if (finalError) console.log(`FINAL ERROR : ${finalError}`);

  printTimeline(phases, totalMs);
  printAggregates(phases, totalMs);

  if (outputJsonPath) {
    const payload = {
      question,
      mode: mode ?? 'auto',
      totalMs,
      finalStopReason,
      finalError,
      phases,
    };
    const absolutePath = resolve(process.cwd(), outputJsonPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
    console.log('');
    console.log(`JSON timeline written to ${absolutePath}`);
  }
}

main().catch((error: unknown) => {
  console.error('profile-manufacturing-line failed:', error);
  process.exit(1);
});
