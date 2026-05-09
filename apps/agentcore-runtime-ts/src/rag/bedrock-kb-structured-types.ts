import type {
  StructuredQueryExecutionStatus,
  StructuredQueryRow,
} from './structured-query-executor-types.js';
import type { StructuredQueryPlan } from './structured-query-types.js';

export type BedrockKbStructuredExecutionMode = 'stub' | 'dry_run' | 'live';

export type BedrockKbStructuredRequest = {
  plan: StructuredQueryPlan;
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
  executionMode: BedrockKbStructuredExecutionMode;
  dryRun: boolean;
  metadata?: Record<string, unknown> | undefined;
};

export type BedrockKbStructuredRawResult = {
  status: StructuredQueryExecutionStatus;
  rows: StructuredQueryRow[];
  message?: string | undefined;
  rawQuery?: string | undefined;
  rawProviderResponse?: unknown;
  metadata?: Record<string, unknown> | undefined;
};

export type BedrockKbStructuredNormalizerInput = {
  request: BedrockKbStructuredRequest;
  rawResult: BedrockKbStructuredRawResult;
  createBrief?: boolean | undefined;
};
