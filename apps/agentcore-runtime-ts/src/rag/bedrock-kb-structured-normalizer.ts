import {
  buildCitations,
  createBrief,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import type {
  BedrockKbStructuredNormalizerInput,
  BedrockKbStructuredRawResult,
  BedrockKbStructuredRequest,
} from './bedrock-kb-structured-types.js';
import type {
  StructuredQueryExecutionOutput,
  StructuredQueryExecutionSummary,
  StructuredQueryRow,
} from './structured-query-executor-types.js';
import type { StructuredQueryPlan } from './structured-query-types.js';

const MAX_STRUCTURED_ROWS = 1000;
const MAX_STRUCTURED_SNIPPET_LENGTH = 3000;
const BEDROCK_PROVIDER_NAME = 'bedrock-kb-structured-provider';
const BEDROCK_DATA_SOURCE_KIND = 'bedrock_kb_structured';

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCellValue(value: unknown): StructuredQueryRow[string] | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value === null) {
    return null;
  }

  return undefined;
}

function normalizeStructuredRows(inputRows: unknown[]): {
  rows: StructuredQueryRow[];
  truncated: boolean;
  originalRowCount: number;
} {
  const originalRowCount = inputRows.length;
  const truncated = originalRowCount > MAX_STRUCTURED_ROWS;
  const rowsToProcess = truncated ? inputRows.slice(0, MAX_STRUCTURED_ROWS) : inputRows;
  const rows: StructuredQueryRow[] = [];

  for (const row of rowsToProcess) {
    if (!isRecord(row)) {
      continue;
    }

    const normalizedRow: StructuredQueryRow = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedValue = normalizeCellValue(value);
      if (normalizedValue !== undefined) {
        normalizedRow[key] = normalizedValue;
      }
    }

    rows.push(normalizedRow);
  }

  return { rows, truncated, originalRowCount };
}

function stableColumnNames(rows: StructuredQueryRow[]): string[] {
  const columnNames: string[] = [];
  const seen = new Set<string>();

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

function buildMetadata(
  request: BedrockKbStructuredRequest,
  rawResult: BedrockKbStructuredRawResult,
  truncated: boolean,
  originalRowCount: number,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...request.metadata,
    ...rawResult.metadata,
    provider: BEDROCK_PROVIDER_NAME,
    planId: request.plan.id,
    executionMode: request.executionMode,
  };

  if (request.knowledgeBaseId !== undefined) {
    metadata.knowledgeBaseId = request.knowledgeBaseId;
  }

  if (request.region !== undefined) {
    metadata.region = request.region;
  }

  if (request.dataSourceName !== undefined) {
    metadata.dataSourceName = request.dataSourceName;
  }

  if (truncated) {
    metadata.truncated = true;
    metadata.originalRowCount = originalRowCount;
  }

  return metadata;
}

function buildSummary(
  request: BedrockKbStructuredRequest,
  rawResult: BedrockKbStructuredRawResult,
  rows: StructuredQueryRow[],
  columnNames: string[],
): StructuredQueryExecutionSummary {
  return {
    status: rawResult.status,
    rowCount: rows.length,
    columnNames,
    dataSourceKind: BEDROCK_DATA_SOURCE_KIND,
    intent: request.plan.intent,
    dryRun: request.dryRun,
    ...definedProperty('message', rawResult.message),
  };
}

function buildSources(
  request: BedrockKbStructuredRequest,
  summary: StructuredQueryExecutionSummary,
  rows: StructuredQueryRow[],
): ReturnType<typeof normalizeEvidenceSource>[] {
  const source = normalizeEvidenceSource({
    type: 'structured_data',
    title: `Bedrock KB structured query result: ${request.plan.intent}`,
    snippet: JSON.stringify({ rows, summary }).slice(0, MAX_STRUCTURED_SNIPPET_LENGTH),
    metadata: {
      provider: BEDROCK_PROVIDER_NAME,
      planId: request.plan.id,
      intent: request.plan.intent,
      dataSourceKind: BEDROCK_DATA_SOURCE_KIND,
      status: summary.status,
      executionMode: request.executionMode,
    },
  });

  return [source];
}

function buildBriefKeyFacts(rows: StructuredQueryRow[]): string[] | undefined {
  if (rows.length === 0) {
    return undefined;
  }

  return [`Structured query returned ${rows.length} rows.`];
}

function buildBriefOpenQuestions(
  status: StructuredQueryExecutionSummary['status'],
): string[] | undefined {
  if (status !== 'not_implemented') {
    return undefined;
  }

  return ['Bedrock KB structured provider is not implemented yet.'];
}

export function buildBedrockKbStructuredRequest(input: {
  plan: StructuredQueryPlan;
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
  executionMode?: BedrockKbStructuredRequest['executionMode'] | undefined;
  dryRun?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}): BedrockKbStructuredRequest {
  return {
    plan: input.plan,
    knowledgeBaseId: input.knowledgeBaseId,
    region: input.region,
    dataSourceName: input.dataSourceName,
    executionMode: input.executionMode ?? 'stub',
    dryRun: input.dryRun ?? true,
    metadata: {
      ...input.metadata,
      provider: BEDROCK_PROVIDER_NAME,
      planId: input.plan.id,
      executionMode: input.executionMode ?? 'stub',
    },
  };
}

export function createNotImplementedBedrockKbStructuredRawResult(
  request: BedrockKbStructuredRequest,
  options: {
    message?: string | undefined;
  } = {},
): BedrockKbStructuredRawResult {
  return {
    status: 'not_implemented',
    rows: [],
    message: options.message ?? 'Bedrock KB structured provider is not implemented yet.',
    metadata: {
      provider: BEDROCK_PROVIDER_NAME,
      planId: request.plan.id,
      executionMode: request.executionMode,
    },
  };
}

export function normalizeBedrockKbStructuredResult(
  input: BedrockKbStructuredNormalizerInput,
): StructuredQueryExecutionOutput {
  const { rows, truncated, originalRowCount } = normalizeStructuredRows(
    input.rawResult.rows,
  );
  const columnNames = stableColumnNames(rows);
  const summary = buildSummary(input.request, input.rawResult, rows, columnNames);
  const sources = buildSources(input.request, summary, rows);
  const citations = buildCitations(sources);
  const shouldCreateBrief = input.createBrief ?? true;
  const metadata = buildMetadata(
    input.request,
    input.rawResult,
    truncated,
    originalRowCount,
  );

  const output: StructuredQueryExecutionOutput = {
    plan: input.request.plan,
    status: input.rawResult.status,
    rows,
    summary,
    sources,
    citations,
    metadata,
  };

  if (shouldCreateBrief) {
    output.brief = createBrief({
      language: 'unknown',
      outputFormat: 'report',
      topic: input.request.plan.question,
      goal: 'Summarize structured query execution results.',
      sourceIds: sources.map((source) => source.id),
      ...definedProperty('keyFacts', buildBriefKeyFacts(rows)),
      ...definedProperty(
        'openQuestions',
        buildBriefOpenQuestions(input.rawResult.status),
      ),
      metadata: {
        provider: BEDROCK_PROVIDER_NAME,
        planId: input.request.plan.id,
        intent: input.request.plan.intent,
        status: input.rawResult.status,
        executionMode: input.request.executionMode,
      },
    });
  }

  return output;
}
