import {
  buildCitations,
  createBrief,
  type EvidenceSource,
  normalizeEvidenceSource,
} from '@agentra/agent-tools';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type {
  RagMetadataFilter,
  RagMetadataFilterCondition,
  RagMetadataFilterOperator,
  RagProvider,
  RagSearchInput,
  RagSearchOutput,
} from './types.js';

const DEFAULT_TOP_K = 5;
const MAX_QUERY_LENGTH = 2000;
const MAX_TEXT_LENGTH = 4000;
const MAX_SNIPPET_LENGTH = 3000;
const MAX_KEY_FACT_LENGTH = 300;
const MAX_KEY_FACTS = 5;
const MAX_QUERY_REWRITE_HINT_LENGTH = 1000;
const MAX_FILTER_CONDITIONS = 20;
const MAX_FILTER_KEY_LENGTH = 200;
const MAX_FILTER_STRING_LENGTH = 1000;
const MAX_FILTER_ARRAY_LENGTH = 50;

type RetrieveClient = {
  send(command: RetrieveCommand): Promise<unknown>;
};

export type BedrockKbRetrieveProviderConfig = {
  knowledgeBaseId: string;
  region?: string | undefined;
  defaultTopK?: number | undefined;
  client?: RetrieveClient | undefined;
};

export type BedrockKbRetrieveSearchInput = RagSearchInput & {
  knowledgeBaseId?: string;
};

export type ResolvedBedrockKbRetrieveInput = {
  query: string;
  knowledgeBaseId: string;
  topK: number;
  createBrief: boolean;
  briefTopic?: string | undefined;
  briefGoal?: string | undefined;
  language: 'ja' | 'en' | 'unknown';
  metadataFilter?: RagMetadataFilter | undefined;
  scoreThreshold?: number | undefined;
  queryRewriteHint?: string | undefined;
};

type ParsedKbResult = {
  text?: string;
  uri?: string;
  title?: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function trimToLength(value: string | undefined, maxLength: number): string | undefined {
  const trimmed = trimText(value);
  return trimmed ? truncateText(trimmed, maxLength) : undefined;
}

function definedProperty<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function validateOptionalText(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
): void {
  if (value !== undefined && value.length > maxLength) {
    throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
  }
}

function validateMetadataFilterCondition(
  condition: RagMetadataFilterCondition,
  index: number,
): void {
  const key = condition.key.trim();
  if (!key) {
    throw new Error(`metadataFilter condition[${index}].key must not be empty`);
  }

  if (key.length > MAX_FILTER_KEY_LENGTH) {
    throw new Error(
      `metadataFilter condition[${index}].key must not exceed ${MAX_FILTER_KEY_LENGTH} characters`,
    );
  }

  const value = condition.value;
  if (Array.isArray(value)) {
    if (value.length > MAX_FILTER_ARRAY_LENGTH) {
      throw new Error(
        `metadataFilter condition[${index}].value array must not exceed ${MAX_FILTER_ARRAY_LENGTH} items`,
      );
    }

    value.forEach((item, itemIndex) => {
      if (typeof item === 'string' && item.length > MAX_FILTER_STRING_LENGTH) {
        throw new Error(
          `metadataFilter condition[${index}].value[${itemIndex}] must not exceed ${MAX_FILTER_STRING_LENGTH} characters`,
        );
      }
    });
    return;
  }

  if (typeof value === 'string' && value.length > MAX_FILTER_STRING_LENGTH) {
    throw new Error(
      `metadataFilter condition[${index}].value must not exceed ${MAX_FILTER_STRING_LENGTH} characters`,
    );
  }
}

function validateMetadataFilter(filter: RagMetadataFilter | undefined): void {
  if (filter === undefined) {
    return;
  }

  const conditions = [...(filter.andAll ?? []), ...(filter.orAll ?? [])];
  if (conditions.length > MAX_FILTER_CONDITIONS) {
    throw new Error(
      `metadataFilter must not exceed ${MAX_FILTER_CONDITIONS} total conditions`,
    );
  }

  conditions.forEach((condition, index) => {
    validateMetadataFilterCondition(condition, index);
  });
}

function normalizeTopK(value: number | undefined): number {
  if (Number.isInteger(value) && value !== undefined && value >= 1 && value <= 20) {
    return value;
  }

  return DEFAULT_TOP_K;
}

function resolveRegion(region?: string): string {
  return (
    region ??
    process.env.BEDROCK_KB_REGION ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    'us-east-1'
  );
}

function pickLocationUri(location: unknown): string | undefined {
  if (!isRecord(location)) {
    return undefined;
  }

  const locationKeys = [
    ['s3Location', 'uri'],
    ['webLocation', 'url'],
    ['confluenceLocation', 'url'],
    ['sharePointLocation', 'url'],
  ] as const;

  for (const [containerKey, valueKey] of locationKeys) {
    const container = location[containerKey];
    if (!isRecord(container)) {
      continue;
    }

    const value = trimText(asString(container[valueKey]));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function pickMetadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = trimText(asString(metadata[key]));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseKbRetrieveResults(response: unknown): ParsedKbResult[] {
  if (!isRecord(response)) {
    return [];
  }

  const rawResults = Array.isArray(response.retrievalResults)
    ? response.retrievalResults
    : [];
  const results: ParsedKbResult[] = [];

  for (const entry of rawResults) {
    if (!isRecord(entry)) {
      continue;
    }

    const content = isRecord(entry.content) ? entry.content : undefined;
    const text = trimToLength(asString(content?.text), MAX_SNIPPET_LENGTH);
    const metadata = isRecord(entry.metadata) ? entry.metadata : undefined;
    const uri =
      pickLocationUri(entry.location) ??
      pickMetadataString(metadata, ['source', 'uri', 'url']);
    const title =
      pickMetadataString(metadata, ['title', 'filename', 'fileName', 'source']) ?? uri;
    const score = asNumber(entry.score);

    if (!text && !uri && !title && score === undefined && metadata === undefined) {
      continue;
    }

    results.push({
      ...definedProperty('text', text),
      ...definedProperty('uri', uri),
      ...definedProperty('title', title),
      ...definedProperty('score', score),
      ...definedProperty('metadata', metadata),
    });
  }

  return results;
}

function buildKeyFacts(sources: EvidenceSource[]): string[] | undefined {
  const keyFacts: string[] = [];

  for (const source of sources) {
    if (keyFacts.length >= MAX_KEY_FACTS) {
      break;
    }

    const keyFact = trimToLength(source.snippet, MAX_KEY_FACT_LENGTH);
    if (keyFact && !keyFacts.includes(keyFact)) {
      keyFacts.push(keyFact);
    }
  }

  return keyFacts.length > 0 ? keyFacts : undefined;
}

function resolveBedrockKbRetrieveInput(
  input: BedrockKbRetrieveSearchInput,
  config: {
    knowledgeBaseId?: string | undefined;
    defaultTopK?: number | undefined;
  } = {},
): ResolvedBedrockKbRetrieveInput {
  const query = input.query.trim();
  if (!query) {
    throw new Error('query must not be empty');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query must not exceed ${MAX_QUERY_LENGTH} characters`);
  }

  validateOptionalText(input.briefTopic, 'briefTopic', MAX_TEXT_LENGTH);
  validateOptionalText(input.briefGoal, 'briefGoal', MAX_TEXT_LENGTH);
  validateOptionalText(
    input.queryRewriteHint,
    'queryRewriteHint',
    MAX_QUERY_REWRITE_HINT_LENGTH,
  );
  validateMetadataFilter(input.metadataFilter);

  if (
    input.scoreThreshold !== undefined &&
    (!Number.isFinite(input.scoreThreshold) ||
      input.scoreThreshold < 0 ||
      input.scoreThreshold > 1)
  ) {
    throw new Error('scoreThreshold must be between 0 and 1');
  }

  const knowledgeBaseId =
    trimText(input.knowledgeBaseId) ?? trimText(config.knowledgeBaseId);
  if (!knowledgeBaseId) {
    throw new Error('knowledgeBaseId must be provided or BEDROCK_KB_ID must be set');
  }

  return {
    query,
    knowledgeBaseId,
    topK: normalizeTopK(input.topK ?? config.defaultTopK),
    createBrief: input.createBrief ?? true,
    language: input.language ?? 'unknown',
    ...definedProperty('metadataFilter', input.metadataFilter),
    ...definedProperty('scoreThreshold', input.scoreThreshold),
    ...definedProperty('queryRewriteHint', trimText(input.queryRewriteHint)),
    ...definedProperty('briefTopic', trimText(input.briefTopic)),
    ...definedProperty('briefGoal', trimText(input.briefGoal)),
  };
}

type BedrockRetrievalFilterCondition = {
  equals?: { key: string; value: unknown };
  notEquals?: { key: string; value: unknown };
  greaterThan?: { key: string; value: unknown };
  greaterThanOrEquals?: { key: string; value: unknown };
  lessThan?: { key: string; value: unknown };
  lessThanOrEquals?: { key: string; value: unknown };
  in?: { key: string; value: unknown };
  notIn?: { key: string; value: unknown };
  startsWith?: { key: string; value: unknown };
  listContains?: { key: string; value: unknown };
  stringContains?: { key: string; value: unknown };
  andAll?: BedrockRetrievalFilterCondition[];
  orAll?: BedrockRetrievalFilterCondition[];
};

function mapFilterCondition(
  operator: RagMetadataFilterOperator,
  condition: RagMetadataFilterCondition,
): BedrockRetrievalFilterCondition {
  const payload = {
    key: condition.key.trim(),
    value: condition.value,
  };

  switch (operator) {
    case 'equals':
      return { equals: payload };
    case 'not_equals':
      return { notEquals: payload };
    case 'greater_than':
      return { greaterThan: payload };
    case 'greater_than_or_equals':
      return { greaterThanOrEquals: payload };
    case 'less_than':
      return { lessThan: payload };
    case 'less_than_or_equals':
      return { lessThanOrEquals: payload };
    case 'in':
      return { in: payload };
    case 'not_in':
      return { notIn: payload };
    case 'starts_with':
      return { startsWith: payload };
    case 'list_contains':
      return { listContains: payload };
    case 'string_contains':
      return { stringContains: payload };
  }
}

function mapConditions(
  conditions: RagMetadataFilterCondition[] | undefined,
): BedrockRetrievalFilterCondition[] | undefined {
  if (!conditions || conditions.length === 0) {
    return undefined;
  }

  return conditions.map((condition) => mapFilterCondition(condition.operator, condition));
}

export function toBedrockRetrievalFilter(
  filter: RagMetadataFilter | undefined,
): unknown | undefined {
  if (filter === undefined) {
    return undefined;
  }

  const andAll = mapConditions(filter.andAll);
  const orAll = mapConditions(filter.orAll);

  if (andAll && orAll) {
    return {
      andAll: [{ andAll }, { orAll }],
    };
  }

  if (andAll) {
    return { andAll };
  }

  if (orAll) {
    return { orAll };
  }

  return undefined;
}

function createBedrockAgentRuntimeClient(region = resolveRegion()): RetrieveClient {
  return new BedrockAgentRuntimeClient({ region });
}

async function retrieveKnowledgeBase(
  client: RetrieveClient,
  input: ResolvedBedrockKbRetrieveInput,
): Promise<unknown> {
  const bedrockFilter = toBedrockRetrievalFilter(input.metadataFilter);
  const command = new RetrieveCommand({
    knowledgeBaseId: input.knowledgeBaseId,
    retrievalQuery: {
      text: input.query,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: input.topK,
        ...(bedrockFilter ? { filter: bedrockFilter as never } : {}),
      },
    },
  });

  return client.send(command);
}

export function buildBedrockKbRetrieveOutput(
  input: ResolvedBedrockKbRetrieveInput,
  response: unknown,
): RagSearchOutput {
  const retrievedAt = new Date().toISOString();
  const parsedResults = parseKbRetrieveResults(response);
  const originalResultCount = parsedResults.length;
  const scoreThreshold = input.scoreThreshold;
  const filteredResults =
    scoreThreshold === undefined
      ? parsedResults
      : parsedResults.filter(
          (result) => result.score === undefined || result.score >= scoreThreshold,
        );
  const filteredByScoreCount = originalResultCount - filteredResults.length;
  const sources = filteredResults.map((result) =>
    normalizeEvidenceSource({
      type: 'document',
      retrievedAt,
      metadata: {
        ...result.metadata,
        provider: 'bedrock-kb',
        knowledgeBaseId: input.knowledgeBaseId,
      },
      ...definedProperty('title', result.title),
      ...definedProperty('uri', result.uri),
      ...definedProperty('snippet', result.text),
      ...definedProperty('score', result.score),
    }),
  );
  const citations = buildCitations(sources);
  const noResults = sources.length === 0;
  const brief = input.createBrief
    ? (() => {
        const created = createBrief({
          language: input.language,
          outputFormat: 'report',
          topic: input.briefTopic ?? input.query,
          goal:
            input.briefGoal ??
            'Summarize retrieved knowledge base evidence with citations.',
          sourceIds: sources.map((source) => source.id),
          metadata: {
            provider: 'bedrock-kb',
            knowledgeBaseId: input.knowledgeBaseId,
            query: input.query,
            ...definedProperty('queryRewriteHint', input.queryRewriteHint),
            ...definedProperty('noResults', noResults ? true : undefined),
          },
          ...(noResults
            ? {
                openQuestions: [
                  'No relevant knowledge base chunks were retrieved for this query.',
                ],
              }
            : {}),
          ...definedProperty('keyFacts', buildKeyFacts(sources)),
        });

        return noResults ? { ...created, sourceIds: [] } : created;
      })()
    : undefined;

  return {
    query: input.query,
    provider: 'bedrock_kb_retrieve',
    sources,
    citations,
    ...definedProperty('brief', brief),
    rawResultSummary: {
      resultCount: sources.length,
      originalResultCount,
      ...definedProperty(
        'filteredByScoreCount',
        input.scoreThreshold === undefined ? undefined : filteredByScoreCount,
      ),
      ...definedProperty('noResults', noResults ? true : undefined),
    },
    metadata: {
      provider: 'bedrock-kb',
      knowledgeBaseId: input.knowledgeBaseId,
      query: input.query,
      ...definedProperty('queryRewriteHint', input.queryRewriteHint),
      ...definedProperty('noResults', noResults ? true : undefined),
    },
  };
}

export class BedrockKbRetrieveProvider implements RagProvider {
  readonly kind = 'bedrock_kb_retrieve' as const;

  private readonly client: RetrieveClient;

  constructor(private readonly config: BedrockKbRetrieveProviderConfig) {
    this.client = config.client ?? createBedrockAgentRuntimeClient(config.region);
  }

  async search(input: BedrockKbRetrieveSearchInput): Promise<RagSearchOutput> {
    const resolved = resolveBedrockKbRetrieveInput(input, {
      knowledgeBaseId: this.config.knowledgeBaseId,
      defaultTopK: this.config.defaultTopK,
    });
    const response = await retrieveKnowledgeBase(this.client, resolved);
    return buildBedrockKbRetrieveOutput(resolved, response);
  }
}

export { resolveBedrockKbRetrieveInput };
