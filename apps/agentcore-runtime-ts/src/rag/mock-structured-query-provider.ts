import {
  buildCitations,
  createBrief,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import type {
  StructuredQueryExecutionInput,
  StructuredQueryExecutionOutput,
  StructuredQueryExecutionSummary,
  StructuredQueryProvider,
  StructuredQueryRow,
} from './structured-query-executor-types.js';

const MOCK_PROVIDER_NAME = 'mock-structured-query-provider';
const MAX_SNIPPET_LENGTH = 3000;

type MockQueryResult = {
  rows: StructuredQueryRow[];
  message?: string;
  keyFact: string;
};

function resolveTargetSignal(input: StructuredQueryExecutionInput): string {
  const targetSignals = input.plan.metadata?.targetSignals;
  if (Array.isArray(targetSignals)) {
    for (const value of targetSignals) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }

  return 'temperature';
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

function buildMockResult(input: StructuredQueryExecutionInput): MockQueryResult {
  const plan = input.plan;

  switch (plan.intent) {
    case 'error_code_lookup':
      return {
        rows: [
          {
            errorCode: 'E-TEMP-001',
            severity: 'high',
            description: 'Temperature exceeded configured threshold.',
            recommendedAction: 'Check cooling unit and recent load changes.',
          },
        ],
        keyFact: 'Found 1 mock error-code row.',
      };
    case 'anomaly_summary': {
      const signal = resolveTargetSignal(input);
      return {
        rows: [
          {
            lineId: plan.targetEntity ?? 'line-unknown',
            signal,
            anomalyCount: 3,
            peakValue: 87.4,
            averageValue: 74.2,
          },
        ],
        keyFact: `Found 3 mock ${signal} anomalies.`,
      };
    }
    case 'kpi_aggregation':
      return {
        rows: [
          {
            metric: 'availability',
            value: 0.972,
            unit: 'ratio',
          },
          {
            metric: 'throughput',
            value: 1240,
            unit: 'units_per_hour',
          },
        ],
        keyFact: 'Found 2 mock KPI rows.',
      };
    case 'equipment_history_lookup':
      return {
        rows: [
          {
            equipmentId: plan.targetEntity ?? 'equipment-unknown',
            eventType: 'maintenance',
            eventDate: '2026-01-15',
            summary: 'Mock maintenance event for structured RAG pipeline validation.',
          },
        ],
        keyFact: 'Found 1 mock equipment history row.',
      };
    case 'production_trend':
      return {
        rows: [
          { period: '2026-Q1', productionCount: 10200 },
          { period: '2026-Q2', productionCount: 10850 },
        ],
        keyFact: 'Found 2 mock production trend rows.',
      };
    default:
      return {
        rows: [],
        message: 'No mock rows are available for this structured query intent.',
        keyFact: 'No mock rows are available for this structured query intent.',
      };
  }
}

function buildBriefKeyFacts(input: MockQueryResult): string[] {
  return [input.keyFact];
}

function buildMetadata(input: StructuredQueryExecutionInput): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    provider: MOCK_PROVIDER_NAME,
    planId: input.plan.id,
  };

  const planner = input.plan.metadata?.planner;
  if (planner !== undefined) {
    metadata.planner = planner;
  }

  return metadata;
}

function buildSourceMetadata(
  input: StructuredQueryExecutionInput,
): Record<string, unknown> {
  const metadata = buildMetadata(input);
  return {
    ...metadata,
    intent: input.plan.intent,
    dataSourceKind: 'mock',
  };
}

export function buildMockStructuredQueryOutput(
  input: StructuredQueryExecutionInput,
): StructuredQueryExecutionOutput {
  const result = buildMockResult(input);
  const rows = result.rows;
  const status: StructuredQueryExecutionSummary['status'] =
    rows.length > 0 ? 'success' : 'empty';
  const columnNames = stableColumnNames(rows);
  const summary = {
    status,
    rowCount: rows.length,
    columnNames,
    dataSourceKind: 'mock' as const,
    intent: input.plan.intent,
    dryRun: input.dryRun ?? true,
    ...(result.message !== undefined ? { message: result.message } : {}),
  };
  const sources = [
    normalizeEvidenceSource({
      type: 'structured_data',
      title: `Mock structured query result: ${input.plan.intent}`,
      snippet: JSON.stringify({ rows, summary }).slice(0, MAX_SNIPPET_LENGTH),
      metadata: buildSourceMetadata(input),
    }),
  ];
  const citations = buildCitations(sources);
  const createBriefOutput = input.createBrief ?? true;
  const metadata = buildMetadata(input);

  const output: StructuredQueryExecutionOutput = {
    plan: input.plan,
    status,
    rows,
    summary,
    sources,
    citations,
    metadata,
  };

  if (createBriefOutput) {
    output.brief = createBrief({
      language: 'unknown',
      outputFormat: 'report',
      topic: input.plan.question,
      goal: 'Summarize structured query execution results.',
      keyFacts: buildBriefKeyFacts(result),
      sourceIds: sources.map((source) => source.id),
      metadata: {
        provider: MOCK_PROVIDER_NAME,
        planId: input.plan.id,
        intent: input.plan.intent,
      },
    });
  }

  return output;
}

export class MockStructuredQueryProvider implements StructuredQueryProvider {
  readonly kind = 'mock' as const;

  async execute(
    input: StructuredQueryExecutionInput,
  ): Promise<StructuredQueryExecutionOutput> {
    return buildMockStructuredQueryOutput(input);
  }
}
