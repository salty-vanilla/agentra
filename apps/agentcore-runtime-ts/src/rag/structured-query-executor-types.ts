import type { Brief, Citation, EvidenceSource } from '@agentra/agent-tools';
import type {
  StructuredQueryDataSourceKind,
  StructuredQueryPlan,
} from './structured-query-types.js';

export type StructuredQueryCellValue = string | number | boolean | null;

export type StructuredQueryRow = Record<string, StructuredQueryCellValue>;

export type StructuredQueryExecutionStatus =
  | 'success'
  | 'empty'
  | 'error'
  | 'not_implemented';

export type StructuredQueryExecutionInput = {
  plan: StructuredQueryPlan;
  dryRun?: boolean | undefined;
  createBrief?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredQueryExecutionSummary = {
  status: StructuredQueryExecutionStatus;
  rowCount: number;
  columnNames: string[];
  dataSourceKind: StructuredQueryDataSourceKind;
  intent: StructuredQueryPlan['intent'];
  dryRun: boolean;
  message?: string | undefined;
};

export type StructuredQueryExecutionOutput = {
  plan: StructuredQueryPlan;
  status: StructuredQueryExecutionStatus;
  rows: StructuredQueryRow[];
  summary: StructuredQueryExecutionSummary;
  sources: EvidenceSource[];
  citations: Citation[];
  brief?: Brief;
  metadata?: Record<string, unknown> | undefined;
};

export interface StructuredQueryProvider {
  readonly kind: StructuredQueryDataSourceKind;
  execute(input: StructuredQueryExecutionInput): Promise<StructuredQueryExecutionOutput>;
}
