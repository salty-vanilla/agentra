import {
  type Brief,
  buildCitations,
  type Citation,
  createBrief,
  type EvidenceSource,
} from '@agentra/agent-tools';
import type {
  StructuredAnswerSynthesisInput,
  StructuredAnswerSynthesisOutput,
  StructuredAnswerSynthesisStatus,
} from './structured-answer-synthesis-types.js';
import type { StructuredQueryExecutionOutput } from './structured-query-executor-types.js';

const SYNTHESIZER_ID = 'structured-answer-synthesis-v1';
const DEFAULT_ROWS_PREVIEW_LIMIT = 5;
const MAX_ROWS_PREVIEW_LIMIT = 50;
const MAX_FINDINGS = 10;

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = trimText(value);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    deduped.push(trimmed);
  }

  return deduped;
}

function humanizeIntent(
  intent: StructuredQueryExecutionOutput['summary']['intent'],
): string {
  switch (intent) {
    case 'anomaly_summary':
      return 'Anomaly summary';
    case 'error_code_lookup':
      return 'Error code lookup';
    case 'kpi_aggregation':
      return 'KPI aggregation';
    case 'equipment_history_lookup':
      return 'Equipment history lookup';
    case 'production_trend':
      return 'Production trend';
    case 'generic_lookup':
      return 'Structured query';
    case 'unknown':
    default:
      return 'Structured query';
  }
}

function humanizeTone(tone: StructuredAnswerSynthesisInput['tone']): {
  audience?: Brief['audience'];
  outputFormat?: Brief['outputFormat'];
} {
  switch (tone) {
    case 'executive':
      return { audience: 'executive', outputFormat: 'presentation' };
    case 'engineering':
      return { audience: 'engineer', outputFormat: 'report' };
    case 'concise':
      return { audience: 'general', outputFormat: 'chat' };
    case 'detailed':
    default:
      return { audience: 'general', outputFormat: 'report' };
  }
}

function resolveStatus(
  flow: StructuredAnswerSynthesisInput['flow'],
): StructuredAnswerSynthesisStatus {
  switch (flow.status) {
    case 'needs_clarification':
    case 'not_configured':
    case 'unsupported':
      return flow.status;
    case 'executed': {
      const executionStatus = flow.execution?.status;
      if (executionStatus === 'empty') {
        return 'no_data';
      }

      if (executionStatus === 'not_implemented') {
        return 'not_implemented';
      }

      if (executionStatus === 'success') {
        return 'answer_ready';
      }

      return 'error';
    }
    case 'planned':
    case 'validated':
    case 'ready':
    case 'error':
    default:
      return 'error';
  }
}

function resolveTitle(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
}): string {
  const intent = humanizeIntent(input.flow.plan.intent);

  switch (input.status) {
    case 'answer_ready':
      return intent;
    case 'needs_clarification':
      return `${intent} needs clarification`;
    case 'not_configured':
      return `${intent} not configured`;
    case 'unsupported':
      return `${intent} not supported`;
    case 'no_data':
      return `${intent} returned no data`;
    case 'not_implemented':
      return `${intent} not implemented`;
    case 'error':
    default:
      return `${intent} synthesis error`;
  }
}

function buildSummary(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
  rowCount: number;
}): string {
  const intent = humanizeIntent(input.flow.plan.intent);

  switch (input.status) {
    case 'answer_ready':
      return `${intent} returned ${input.rowCount} row${input.rowCount === 1 ? '' : 's'}.`;
    case 'needs_clarification':
      return 'More information is needed before this structured query can be answered safely.';
    case 'not_configured':
      return 'The requested structured provider is not configured.';
    case 'unsupported':
      return 'The requested structured provider path is not supported in this phase.';
    case 'no_data':
      return 'No structured rows were returned.';
    case 'not_implemented':
      return 'Structured provider is not implemented yet or is running in stub mode.';
    case 'error':
    default:
      return 'Structured answer synthesis could not normalize the flow output.';
  }
}

function stableColumnNames(rows: StructuredQueryExecutionOutput['rows']): string[] {
  const seen = new Set<string>();
  const columnNames: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      columnNames.push(key);
    }
  }

  return columnNames;
}

function isPrimitiveValue(value: unknown): value is string | number | boolean | null {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

function normalizeRow(
  row: StructuredQueryExecutionOutput['rows'][number],
): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key] = isPrimitiveValue(value) ? value : null;
  }

  return normalized;
}

function buildRowsPreview(
  rows: StructuredQueryExecutionOutput['rows'],
  maxRows: number | undefined,
): Array<Record<string, string | number | boolean | null>> | undefined {
  const resolvedLimit = Math.min(
    MAX_ROWS_PREVIEW_LIMIT,
    maxRows ?? DEFAULT_ROWS_PREVIEW_LIMIT,
  );

  if (resolvedLimit <= 0 || rows.length === 0) {
    return undefined;
  }

  return rows.slice(0, resolvedLimit).map(normalizeRow);
}

function buildKeyFindings(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
  execution?: StructuredQueryExecutionOutput | undefined;
}): string[] {
  const findings: string[] = [];
  const execution = input.execution;

  if (input.status === 'needs_clarification') {
    const readiness = input.flow.readiness;
    for (const slot of readiness?.missingSlots ?? []) {
      findings.push(`Missing required slot: ${slot}.`);
    }

    for (const issue of readiness?.blockingIssues ?? []) {
      findings.push(issue.message);
    }

    return dedupeStrings(findings).slice(0, MAX_FINDINGS);
  }

  if (input.status === 'no_data') {
    findings.push('No structured rows were returned.');
    return findings;
  }

  if (input.status === 'not_implemented') {
    findings.push(
      'Structured provider is not implemented yet or is running in stub mode.',
    );
    return findings;
  }

  if (input.status !== 'answer_ready' || execution === undefined) {
    return findings;
  }

  const briefFacts = execution.brief?.keyFacts ?? [];
  findings.push(...briefFacts);

  const rowCount = execution.rows.length;
  findings.push(
    `${humanizeIntent(input.flow.plan.intent)} returned ${rowCount} row${rowCount === 1 ? '' : 's'}.`,
  );

  const columnNames =
    execution.summary.columnNames.length > 0
      ? execution.summary.columnNames
      : stableColumnNames(execution.rows);
  if (columnNames.length > 0) {
    findings.push(`Columns: ${columnNames.join(', ')}.`);
  }

  if (input.flow.plan.intent === 'anomaly_summary') {
    findings.push(
      'The result is phrased generically so the signal can remain explicit only when metadata provides it.',
    );
  } else {
    findings.push(
      'Use the structured result as grounded input for downstream chat, report, or slide generation.',
    );
  }

  return dedupeStrings(findings).slice(0, MAX_FINDINGS);
}

function buildCaveats(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
  execution?: StructuredQueryExecutionOutput | undefined;
  sources: EvidenceSource[];
  citations: Citation[];
}): string[] {
  const caveats: string[] = [];
  const execution = input.execution;
  const summary = execution?.summary;

  if (summary?.dataSourceKind === 'mock') {
    caveats.push('Rows are mock/demo data and must not be treated as production data.');
  }

  if (summary?.dryRun === true || input.status === 'not_implemented') {
    caveats.push('No live production data was queried.');
  }

  if (input.status === 'unsupported') {
    caveats.push('The requested provider path is not implemented in this phase.');
  }

  if (input.status === 'not_configured') {
    caveats.push('The requested structured provider is not configured.');
  }

  if (input.sources.length === 0 || input.citations.length === 0) {
    caveats.push('No citations were available for this structured result.');
  }

  if (
    input.status === 'needs_clarification' &&
    (input.flow.readiness?.blockingIssues.length ?? 0) > 0
  ) {
    caveats.push(
      'Structured execution is blocked until the missing information is resolved.',
    );
  }

  return dedupeStrings(caveats);
}

function buildNextActions(input: {
  status: StructuredAnswerSynthesisStatus;
  flow: StructuredAnswerSynthesisInput['flow'];
}): string[] {
  switch (input.status) {
    case 'needs_clarification':
      return [
        'Ask for the missing slots or blocking details, then rerun structured RAG.',
      ];
    case 'not_configured':
      return [
        'Enable or configure the requested structured provider, or fall back to kb_retrieve.',
      ];
    case 'unsupported':
      return [
        'Use a supported provider path or wait for the future provider implementation.',
      ];
    case 'no_data':
      return ['Refine the filters, target entity, or time range and try again.'];
    case 'not_implemented':
      return [
        'Implement the live adapter or keep this path for mock/demo validation only.',
      ];
    case 'answer_ready':
      return [
        'Use the structured answer as grounded input for chat, report, or slide generation.',
      ];
    case 'error':
    default:
      return [
        'Inspect the structured flow output and retry after fixing validation or provider wiring.',
      ];
  }
}

function buildBrief(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
  summary: string;
  keyFindings: string[];
  sources: EvidenceSource[];
  createBrief: boolean | undefined;
  tone: StructuredAnswerSynthesisInput['tone'];
}): Brief | undefined {
  if (input.createBrief === false) {
    return undefined;
  }

  const existingBrief = input.flow.execution?.brief;
  if (existingBrief !== undefined) {
    return existingBrief;
  }

  const tone = humanizeTone(input.tone);
  const briefInput: Parameters<typeof createBrief>[0] = {
    language: 'unknown',
    topic: resolveTitle({ flow: input.flow, status: input.status }),
    goal: input.summary,
    keyFacts: input.keyFindings,
    sourceIds: input.sources.map((source) => source.id),
    metadata: {
      status: input.status,
      intent: input.flow.plan.intent,
      dataSourceKind: input.flow.execution?.summary.dataSourceKind,
      synthesizer: SYNTHESIZER_ID,
    },
  };

  if (tone.audience !== undefined) {
    briefInput.audience = tone.audience;
  }

  if (tone.outputFormat !== undefined) {
    briefInput.outputFormat = tone.outputFormat;
  }

  return createBrief(briefInput);
}

function buildMetadata(input: {
  flow: StructuredAnswerSynthesisInput['flow'];
  status: StructuredAnswerSynthesisStatus;
  tone: StructuredAnswerSynthesisInput['tone'];
  metadata: Record<string, unknown> | undefined;
  brief?: Brief | undefined;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    status: input.status,
    intent: input.flow.plan.intent,
    dataSourceKind: input.flow.execution?.summary.dataSourceKind,
    synthesizer: SYNTHESIZER_ID,
  };

  if (input.tone !== undefined) {
    metadata.tone = input.tone;
  }

  const briefSourceIds = input.brief?.sourceIds;
  if (briefSourceIds !== undefined && briefSourceIds.length > 0) {
    metadata.executionBriefSourceIds = briefSourceIds;
  }

  const executionBriefSourceIds = input.flow.execution?.brief?.sourceIds;
  if (executionBriefSourceIds !== undefined && executionBriefSourceIds.length > 0) {
    metadata.executionSourceIds = executionBriefSourceIds;
  }

  return metadata;
}

function collectSources(flow: StructuredAnswerSynthesisInput['flow']): EvidenceSource[] {
  return flow.execution?.sources ?? [];
}

function collectCitations(flow: StructuredAnswerSynthesisInput['flow']): Citation[] {
  return flow.execution?.citations ?? [];
}

export function synthesizeStructuredAnswer(
  input: StructuredAnswerSynthesisInput,
): StructuredAnswerSynthesisOutput {
  const status = resolveStatus(input.flow);
  const execution = input.flow.execution;
  const sources = collectSources(input.flow);
  const citations = collectCitations(input.flow);
  const summary = buildSummary({
    flow: input.flow,
    status,
    rowCount: execution?.rows.length ?? 0,
  });
  const keyFindings = buildKeyFindings({
    flow: input.flow,
    status,
    execution,
  });
  const caveats = buildCaveats({
    flow: input.flow,
    status,
    execution,
    sources,
    citations,
  });
  const nextActions = buildNextActions({
    status,
    flow: input.flow,
  });
  const brief = buildBrief({
    flow: input.flow,
    status,
    summary,
    keyFindings,
    sources,
    createBrief: input.createBrief,
    tone: input.tone,
  });

  return {
    status,
    title: resolveTitle({ flow: input.flow, status }),
    summary,
    keyFindings,
    caveats,
    nextActions,
    sources,
    citations: citations.length > 0 ? citations : buildCitations(sources),
    ...(brief !== undefined ? { brief } : {}),
    ...(input.includeRows === true && execution !== undefined
      ? {
          rowsPreview: buildRowsPreview(execution.rows, input.maxRows),
        }
      : {}),
    metadata: buildMetadata({
      flow: input.flow,
      status,
      tone: input.tone,
      metadata: input.metadata,
      brief,
    }),
  };
}
