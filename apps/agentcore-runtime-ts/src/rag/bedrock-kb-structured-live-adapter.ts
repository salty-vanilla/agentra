import type {
  FilterAttribute,
  RetrievalFilter,
  RetrieveCommandInput,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  buildBedrockKbStructuredRequest,
  createNotImplementedBedrockKbStructuredRawResult,
} from './bedrock-kb-structured-normalizer.js';
import type {
  BedrockKbStructuredRawResult,
  BedrockKbStructuredRequest,
} from './bedrock-kb-structured-types.js';
import type { StructuredQueryRow } from './structured-query-executor-types.js';

const MAX_QUERY_TEXT_LENGTH = 3000;
const MAX_RESPONSE_ROWS_PREVIEW = 20;
type StructuredPlanFilter = NonNullable<
  BedrockKbStructuredRequest['plan']['filters']
>[number];

export type BedrockKbStructuredLiveAdapterClient = {
  send(command: RetrieveCommand): Promise<unknown>;
};

export type BedrockKbStructuredLiveAdapterConfig = {
  client?: BedrockKbStructuredLiveAdapterClient | undefined;
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
};

export interface BedrockKbStructuredLiveAdapter {
  execute(request: BedrockKbStructuredRequest): Promise<BedrockKbStructuredRawResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
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

function normalizeFilterAttributeValue(
  value: unknown,
): FilterAttribute['value'] | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value)
  ) {
    return value as FilterAttribute['value'];
  }

  return undefined;
}

function normalizeFilterAttribute(
  key: string | undefined,
  value: unknown,
): FilterAttribute | undefined {
  const trimmedKey = trimText(key);
  const normalizedValue = normalizeFilterAttributeValue(value);

  if (trimmedKey === undefined || normalizedValue === undefined) {
    return undefined;
  }

  return {
    key: trimmedKey,
    value: normalizedValue,
  };
}

function normalizePlanFilter(filter: StructuredPlanFilter): RetrievalFilter | undefined {
  const attribute = normalizeFilterAttribute(filter.field, filter.value);
  if (attribute === undefined) {
    return undefined;
  }

  switch (filter.operator) {
    case 'equals':
      return { equals: attribute };
    case 'not_equals':
      return { notEquals: attribute };
    case 'contains':
      return Array.isArray(filter.value)
        ? { listContains: attribute }
        : { stringContains: attribute };
    case 'in':
      return { in: attribute };
    case 'greater_than':
      return { greaterThan: attribute };
    case 'greater_than_or_equals':
      return { greaterThanOrEquals: attribute };
    case 'less_than':
      return { lessThan: attribute };
    case 'less_than_or_equals':
      return { lessThanOrEquals: attribute };
    default:
      return undefined;
  }
}

function buildRetrievalFilter(
  filters: BedrockKbStructuredRequest['plan']['filters'] | undefined,
):
  | NonNullable<
      NonNullable<
        RetrieveCommandInput['retrievalConfiguration']
      >['vectorSearchConfiguration']
    >['filter']
  | undefined {
  if (filters === undefined || filters.length === 0) {
    return undefined;
  }

  const retrievalFilters = filters
    .map((filter) => normalizePlanFilter(filter))
    .filter((filter): filter is RetrievalFilter => filter !== undefined);

  if (retrievalFilters.length === 0) {
    return undefined;
  }

  if (retrievalFilters.length === 1) {
    return retrievalFilters[0];
  }

  return { andAll: retrievalFilters };
}

function formatList(
  values: Array<string | number | boolean> | undefined,
): string | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  return values.map((value) => String(value)).join(', ');
}

function formatPlanQuery(plan: BedrockKbStructuredRequest['plan']): string {
  const lines: string[] = [`Question: ${plan.question}`, `Intent: ${plan.intent}`];

  if (plan.targetEntity !== undefined) {
    lines.push(`Target entity: ${plan.targetEntity}`);
  }

  if (plan.timeRange !== undefined) {
    const timeRangeParts = [
      plan.timeRange.start ? `start=${plan.timeRange.start}` : undefined,
      plan.timeRange.end ? `end=${plan.timeRange.end}` : undefined,
      plan.timeRange.timezone ? `timezone=${plan.timeRange.timezone}` : undefined,
    ].filter((part): part is string => part !== undefined);

    if (timeRangeParts.length > 0) {
      lines.push(`Time range: ${timeRangeParts.join(', ')}`);
    }
  }

  if (plan.metrics !== undefined && plan.metrics.length > 0) {
    lines.push(`Metrics: ${plan.metrics.join(', ')}`);
  }

  if (plan.groupBy !== undefined && plan.groupBy.length > 0) {
    lines.push(`Group by: ${plan.groupBy.join(', ')}`);
  }

  if (plan.orderBy !== undefined && plan.orderBy.length > 0) {
    lines.push(
      `Order by: ${plan.orderBy
        .map((entry) => `${entry.field} ${entry.direction}`)
        .join(', ')}`,
    );
  }

  if (plan.limit !== undefined) {
    lines.push(`Limit: ${plan.limit}`);
  }

  if (plan.filters !== undefined && plan.filters.length > 0) {
    lines.push(
      'Filters:',
      ...plan.filters.map((filter) => {
        const value = Array.isArray(filter.value)
          ? formatList(filter.value)
          : String(filter.value);
        return `- ${filter.field} ${filter.operator} ${value}`;
      }),
    );
  }

  return truncateText(lines.join('\n'), MAX_QUERY_TEXT_LENGTH);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeRowColumns(columns: unknown): StructuredQueryRow | undefined {
  if (!Array.isArray(columns)) {
    return undefined;
  }

  const row: StructuredQueryRow = {};
  for (const column of columns) {
    if (!isRecord(column)) {
      continue;
    }

    const columnName = trimText(asString(column.columnName));
    const columnValue = normalizeCellValue(column.columnValue);
    if (columnName === undefined || columnValue === undefined) {
      continue;
    }

    row[columnName] = columnValue;
  }

  return Object.keys(row).length > 0 ? row : undefined;
}

function parseRetrievalRows(response: unknown): StructuredQueryRow[] {
  if (!isRecord(response) || !Array.isArray(response.retrievalResults)) {
    return [];
  }

  const rows: StructuredQueryRow[] = [];
  for (const result of response.retrievalResults) {
    if (!isRecord(result) || !isRecord(result.content)) {
      continue;
    }

    const row = normalizeRowColumns(result.content.row);
    if (row !== undefined) {
      rows.push(row);
    }
  }

  return rows;
}

function parseResponseMessage(response: unknown): string | undefined {
  if (!isRecord(response) || !Array.isArray(response.retrievalResults)) {
    return undefined;
  }

  for (const result of response.retrievalResults) {
    if (!isRecord(result) || !isRecord(result.content)) {
      continue;
    }

    const text = trimText(asString(result.content.text));
    if (text !== undefined) {
      return text;
    }

    if (isRecord(result.content.audio)) {
      const audioSummary = trimText(asString(result.content.audio.transcription));
      if (audioSummary !== undefined) {
        return audioSummary;
      }
    }

    if (isRecord(result.content.video)) {
      const videoSummary = trimText(asString(result.content.video.summary));
      if (videoSummary !== undefined) {
        return videoSummary;
      }
    }
  }

  if (isRecord(response) && typeof response.guardrailAction === 'string') {
    return `Bedrock guardrail action: ${response.guardrailAction}`;
  }

  return undefined;
}

function buildRawProviderResponsePreview(
  response: unknown,
  rows: StructuredQueryRow[],
  message: string | undefined,
): Record<string, unknown> {
  const previewRows = rows.slice(0, MAX_RESPONSE_ROWS_PREVIEW);

  return {
    responseType: isObjectLike(response) ? 'object' : typeof response,
    rowCount: rows.length,
    previewRowCount: previewRows.length,
    message: message ?? null,
  };
}

function buildErrorResult(
  request: BedrockKbStructuredRequest,
  error: unknown,
): BedrockKbStructuredRawResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Bedrock KB structured live adapter call failed.';

  return {
    status: 'error',
    rows: [],
    message,
    metadata: {
      provider: 'bedrock-kb-structured-live-adapter',
      planId: request.plan.id,
      executionMode: request.executionMode,
      knowledgeBaseId: request.knowledgeBaseId,
      region: request.region,
      dataSourceName: request.dataSourceName,
      error: true,
    },
  };
}

function buildBoundaryMessage(config: BedrockKbStructuredLiveAdapterConfig): string {
  const knownParts = [
    config.knowledgeBaseId ? undefined : 'missing knowledge base id',
    config.region ? undefined : 'missing region',
  ].filter(Boolean);

  if (knownParts.length === 0) {
    return 'Bedrock KB structured live adapter boundary is not implemented yet.';
  }

  return `Bedrock KB structured live adapter boundary is not implemented yet (${knownParts.join(', ')}).`;
}

function buildRetrieveCommandInput(
  request: BedrockKbStructuredRequest,
): RetrieveCommandInput {
  const queryText = formatPlanQuery(request.plan);
  const numberOfResults =
    request.plan.limit !== undefined && Number.isInteger(request.plan.limit)
      ? Math.min(Math.max(request.plan.limit, 1), 20)
      : 5;
  const vectorSearchConfiguration: NonNullable<
    RetrieveCommandInput['retrievalConfiguration']
  >['vectorSearchConfiguration'] = {
    numberOfResults,
    overrideSearchType: 'SEMANTIC',
    filter: buildRetrievalFilter(request.plan.filters),
  };

  return {
    knowledgeBaseId: request.knowledgeBaseId ?? '',
    retrievalQuery: {
      type: 'TEXT',
      text: queryText,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration,
    },
  };
}

class AwsBedrockKbStructuredLiveAdapter implements BedrockKbStructuredLiveAdapter {
  constructor(private readonly config: BedrockKbStructuredLiveAdapterConfig) {}

  private resolveClient(): BedrockKbStructuredLiveAdapterClient {
    if (this.config.client !== undefined) {
      return this.config.client;
    }

    return new BedrockAgentRuntimeClient({
      region: this.config.region as string,
    });
  }

  async execute(
    request: BedrockKbStructuredRequest,
  ): Promise<BedrockKbStructuredRawResult> {
    if (this.config.knowledgeBaseId === undefined || this.config.region === undefined) {
      return createNotImplementedBedrockKbStructuredRawResult(request, {
        message: buildBoundaryMessage(this.config),
      });
    }

    const retrieveRequest = buildRetrieveCommandInput({
      ...request,
      knowledgeBaseId: this.config.knowledgeBaseId,
      region: this.config.region,
      dataSourceName: this.config.dataSourceName ?? request.dataSourceName,
    });
    const queryText = retrieveRequest.retrievalQuery?.text ?? '';
    const command = new RetrieveCommand(retrieveRequest);

    try {
      const response = await this.resolveClient().send(command);
      const rows = parseRetrievalRows(response);
      const message = parseResponseMessage(response);
      const status = rows.length > 0 ? 'success' : 'empty';

      return {
        status,
        rows,
        message,
        rawProviderResponse: buildRawProviderResponsePreview(response, rows, message),
        metadata: {
          provider: 'bedrock-kb-structured-live-adapter',
          planId: request.plan.id,
          executionMode: request.executionMode,
          knowledgeBaseId: this.config.knowledgeBaseId,
          region: this.config.region,
          dataSourceName: this.config.dataSourceName ?? request.dataSourceName,
          rowCount: rows.length,
          queryText,
        },
      };
    } catch (error) {
      return buildErrorResult(request, error);
    }
  }
}

export class NotImplementedBedrockKbStructuredLiveAdapter
  implements BedrockKbStructuredLiveAdapter
{
  constructor(private readonly config: BedrockKbStructuredLiveAdapterConfig = {}) {}

  async execute(
    request: BedrockKbStructuredRequest,
  ): Promise<BedrockKbStructuredRawResult> {
    return createNotImplementedBedrockKbStructuredRawResult(request, {
      message: buildBoundaryMessage(this.config),
    });
  }
}

export function createBedrockKbStructuredLiveAdapter(
  config: BedrockKbStructuredLiveAdapterConfig = {},
): BedrockKbStructuredLiveAdapter {
  if (config.knowledgeBaseId === undefined || config.region === undefined) {
    return new NotImplementedBedrockKbStructuredLiveAdapter(config);
  }

  return new AwsBedrockKbStructuredLiveAdapter(config);
}

export function createBedrockKbStructuredLiveAdapterRequest(input: {
  plan: BedrockKbStructuredRequest['plan'];
  knowledgeBaseId?: string | undefined;
  region?: string | undefined;
  dataSourceName?: string | undefined;
  executionMode?: BedrockKbStructuredRequest['executionMode'] | undefined;
  dryRun?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}): BedrockKbStructuredRequest {
  return buildBedrockKbStructuredRequest(input);
}

export {
  AwsBedrockKbStructuredLiveAdapter,
  buildBoundaryMessage,
  buildErrorResult,
  buildRawProviderResponsePreview,
  buildRetrievalFilter,
  buildRetrieveCommandInput,
  formatPlanQuery,
  parseResponseMessage,
  parseRetrievalRows,
};
