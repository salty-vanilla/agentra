import { uuidv7 } from 'uuidv7';
import {
  STRUCTURED_QUERY_CAPABILITY_CATALOG,
  STRUCTURED_QUERY_INTENT_PRIORITY,
  STRUCTURED_TARGET_SIGNAL_KEYWORDS,
  type StructuredQueryCapabilitySlot,
  type StructuredQueryCatalogIntent,
  type StructuredTargetSignal,
} from './structured-query-capability-catalog.js';
import type {
  StructuredQueryDataSourceKind,
  StructuredQueryFilter,
  StructuredQueryIntent,
  StructuredQueryMetric,
  StructuredQueryPlan,
  StructuredQueryPlanInput,
  StructuredQueryTimeRange,
} from './structured-query-types.js';

type KeywordIntent = StructuredQueryCatalogIntent;

const INTENT_PRIORITY = STRUCTURED_QUERY_INTENT_PRIORITY;

const INTENT_KEYWORDS = Object.fromEntries(
  Object.entries(STRUCTURED_QUERY_CAPABILITY_CATALOG).map(([intent, capability]) => [
    intent,
    [...capability.keywords],
  ]),
) as Record<KeywordIntent, string[]>;

const DEFAULT_DATA_SOURCE_KIND: StructuredQueryDataSourceKind = 'bedrock_kb_structured';

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = trimText(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }

  return deduped.size > 0 ? [...deduped] : [];
}

function normalizeMetricArray(
  values: StructuredQueryMetric[] | undefined,
): StructuredQueryMetric[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const deduped = new Set<StructuredQueryMetric>();
  for (const value of values) {
    deduped.add(value);
  }

  return [...deduped];
}

function normalizeTargetSignalArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const deduped = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = trimText(value)?.toLowerCase();
    if (trimmed) {
      deduped.add(trimmed);
    }
  }

  return deduped.size > 0 ? [...deduped] : [];
}

function normalizeFilterValue(
  value: StructuredQueryFilter['value'],
): StructuredQueryFilter['value'] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? trimText(item) : item))
      .filter(
        (item): item is string | number | boolean => item !== undefined && item !== '',
      );
    return [...new Set(normalized.map((item) => JSON.stringify(item)))].map((item) =>
      JSON.parse(item),
    ) as Array<string | number | boolean>;
  }

  if (typeof value === 'string') {
    return trimText(value) ?? '';
  }

  return value;
}

function normalizeFilters(
  values: StructuredQueryFilter[] | undefined,
): StructuredQueryFilter[] | undefined {
  if (values === undefined) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: StructuredQueryFilter[] = [];

  for (const filter of values) {
    const field = trimText(filter.field) ?? filter.field;
    const nextFilter: StructuredQueryFilter = {
      field,
      operator: filter.operator,
      value: normalizeFilterValue(filter.value),
    };
    const key = JSON.stringify(nextFilter);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(nextFilter);
    }
  }

  return normalized;
}

function normalizeTimeRange(
  value: StructuredQueryTimeRange | undefined,
): StructuredQueryTimeRange | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = {
    start: trimText(value.start),
    end: trimText(value.end),
    timezone: trimText(value.timezone),
  };

  return normalized.start || normalized.end || normalized.timezone
    ? normalized
    : undefined;
}

function normalizeOrderBy(
  values:
    | Array<{
        field: string;
        direction: 'asc' | 'desc';
      }>
    | undefined,
): StructuredQueryPlan['orderBy'] {
  if (values === undefined) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized: NonNullable<StructuredQueryPlan['orderBy']> = [];

  for (const item of values) {
    const nextItem = {
      field: trimText(item.field) ?? item.field,
      direction: item.direction,
    };
    const key = JSON.stringify(nextItem);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(nextItem);
    }
  }

  return normalized;
}

function normalizeMetadata(
  metadata: Record<string, unknown> | undefined,
  inferredTargetSignals: string[],
): Record<string, unknown> | undefined {
  if (metadata === undefined && inferredTargetSignals.length === 0) {
    return undefined;
  }

  const normalizedMetadata = {
    ...(metadata ?? {}),
    planner: 'deterministic-structured-query-planner',
  } as Record<string, unknown>;

  const userTargetSignals = normalizeTargetSignalArray(normalizedMetadata.targetSignals);
  const mergedTargetSignals = [...inferredTargetSignals, ...(userTargetSignals ?? [])];
  const dedupedTargetSignals = [...new Set(mergedTargetSignals)];

  if (dedupedTargetSignals.length > 0) {
    normalizedMetadata.targetSignals = dedupedTargetSignals;
  } else {
    delete normalizedMetadata.targetSignals;
  }

  return normalizedMetadata;
}

export function inferTargetSignalsFromQuestion(question: string): string[] {
  const normalizedQuestion = question.toLowerCase();
  const inferred: StructuredTargetSignal[] = [];

  for (const [signal, keywords] of Object.entries(
    STRUCTURED_TARGET_SIGNAL_KEYWORDS,
  ) as Array<[StructuredTargetSignal, readonly string[]]>) {
    const hasKeyword = keywords.some((keyword) =>
      keyword === keyword.toLowerCase()
        ? normalizedQuestion.includes(keyword)
        : question.includes(keyword),
    );

    if (hasKeyword) {
      inferred.push(signal);
    }
  }

  return inferred;
}

function inferIntentFromQuestion(question: string): StructuredQueryIntent {
  const normalized = question.toLowerCase();
  for (const intent of INTENT_PRIORITY) {
    const keywords = INTENT_KEYWORDS[intent];
    if (
      keywords.some((keyword) =>
        keyword === keyword.toLowerCase()
          ? normalized.includes(keyword)
          : question.includes(keyword),
      )
    ) {
      return intent;
    }
  }

  const hasAnomalyContext = INTENT_KEYWORDS.anomaly_summary.some((keyword) =>
    keyword === keyword.toLowerCase()
      ? normalized.includes(keyword)
      : question.includes(keyword),
  );
  if (hasAnomalyContext) {
    return 'anomaly_summary';
  }

  if (normalized.includes('lookup') || normalized.includes('search')) {
    return 'generic_lookup';
  }

  return 'unknown';
}

function resolveIntent(
  inputIntent: StructuredQueryIntent | undefined,
  question: string,
): {
  intent: StructuredQueryIntent;
  confidence: number;
} {
  if (inputIntent !== undefined) {
    return {
      intent: inputIntent,
      confidence: 0.9,
    };
  }

  const inferredIntent = inferIntentFromQuestion(question);
  if (inferredIntent === 'unknown') {
    return {
      intent: inferredIntent,
      confidence: 0.3,
    };
  }

  return {
    intent: inferredIntent,
    confidence: 0.65,
  };
}

function hasTimeRange(timeRange: StructuredQueryTimeRange | undefined): boolean {
  return Boolean(timeRange?.start || timeRange?.end || timeRange?.timezone);
}

function defaultLimitForIntent(intent: StructuredQueryIntent): number {
  return STRUCTURED_QUERY_CAPABILITY_CATALOG[intent as KeywordIntent]?.defaultLimit ?? 50;
}

function isSignalHintPresent(input: {
  metrics: StructuredQueryMetric[] | undefined;
  filters: StructuredQueryFilter[] | undefined;
  metadata: Record<string, unknown> | undefined;
}): boolean {
  const hasSignalMetadata = normalizeTargetSignalArray(input.metadata?.targetSignals);
  const hasSignalFilter = Boolean(
    input.filters?.some((filter) => {
      const field = trimText(filter.field)?.toLowerCase();
      return field === 'signal' || field === 'metric' || field === 'sensor';
    }),
  );

  return Boolean(input.metrics?.length || hasSignalMetadata?.length || hasSignalFilter);
}

function isSlotSatisfied(
  slot: StructuredQueryCapabilitySlot,
  input: {
    targetEntity: string | undefined;
    timeRange: StructuredQueryTimeRange | undefined;
    filters: StructuredQueryFilter[] | undefined;
    metrics: StructuredQueryMetric[] | undefined;
    metadata: Record<string, unknown> | undefined;
  },
): boolean {
  switch (slot) {
    case 'error code or equipment':
      return Boolean(input.targetEntity);
    case 'error code filter':
      return Boolean(input.filters?.length);
    case 'target entity':
    case 'equipment':
      return Boolean(input.targetEntity);
    case 'signal or metric':
      return isSignalHintPresent(input);
    case 'time range':
      return hasTimeRange(input.timeRange);
    case 'metrics':
    case 'production metric':
      return Boolean(input.metrics?.length);
  }
}

function buildMissingSlots(
  input: StructuredQueryPlanInput,
  intent: StructuredQueryIntent,
): string[] {
  const missing = new Set<string>();
  const targetEntity = trimText(input.targetEntity);
  const timeRange = normalizeTimeRange(input.timeRange);
  const filters = input.filters?.filter((filter) => Boolean(trimText(filter.field)));
  const metrics = input.metrics?.length ? input.metrics : undefined;
  const metadata = input.metadata as Record<string, unknown> | undefined;

  switch (intent) {
    case 'error_code_lookup':
      if (!targetEntity) {
        missing.add('error code or equipment');
      }
      if (!filters?.length) {
        missing.add('error code filter');
      }
      break;
    case 'anomaly_summary':
      for (const slot of STRUCTURED_QUERY_CAPABILITY_CATALOG.anomaly_summary
        .requiredSlots) {
        if (
          !isSlotSatisfied(slot, { targetEntity, timeRange, filters, metrics, metadata })
        ) {
          missing.add(slot);
        }
      }
      break;
    case 'kpi_aggregation':
      for (const slot of STRUCTURED_QUERY_CAPABILITY_CATALOG.kpi_aggregation
        .requiredSlots) {
        if (
          !isSlotSatisfied(slot, { targetEntity, timeRange, filters, metrics, metadata })
        ) {
          missing.add(slot);
        }
      }
      break;
    case 'equipment_history_lookup':
      for (const slot of STRUCTURED_QUERY_CAPABILITY_CATALOG.equipment_history_lookup
        .requiredSlots) {
        if (
          !isSlotSatisfied(slot, { targetEntity, timeRange, filters, metrics, metadata })
        ) {
          missing.add(slot);
        }
      }
      break;
    case 'production_trend':
      for (const slot of STRUCTURED_QUERY_CAPABILITY_CATALOG.production_trend
        .requiredSlots) {
        if (
          !isSlotSatisfied(slot, { targetEntity, timeRange, filters, metrics, metadata })
        ) {
          missing.add(slot);
        }
      }
      break;
    case 'generic_lookup':
    case 'unknown':
      missing.add('intent');
      missing.add('data source');
      break;
  }

  return [...missing];
}

export function createStructuredQueryPlan(
  input: StructuredQueryPlanInput,
): StructuredQueryPlan {
  const question = input.question.trim();
  const { intent, confidence } = resolveIntent(input.intent, question);
  const inferredTargetSignals = inferTargetSignalsFromQuestion(question);
  const timeRange = normalizeTimeRange(input.timeRange);
  const targetEntity = trimText(input.targetEntity);
  const filters = normalizeFilters(input.filters);
  const metrics = normalizeMetricArray(input.metrics);
  const groupBy = normalizeStringArray(input.groupBy);
  const orderBy = normalizeOrderBy(input.orderBy);
  const assumptions = normalizeStringArray(input.assumptions);
  const notes = normalizeStringArray(input.notes);
  const normalizedMetadata = normalizeMetadata(input.metadata, inferredTargetSignals);
  const missingSlots = buildMissingSlots(
    {
      ...input,
      question,
      timeRange,
      targetEntity,
      filters,
      metrics,
      groupBy,
      orderBy,
      assumptions,
      notes,
      metadata: normalizedMetadata,
    },
    intent,
  );

  return {
    id: uuidv7(),
    createdAt: new Date().toISOString(),
    intent,
    dataSourceKind:
      input.dataSourceKind ??
      STRUCTURED_QUERY_CAPABILITY_CATALOG[intent as KeywordIntent]?.dataSourceKind ??
      DEFAULT_DATA_SOURCE_KIND,
    question,
    ...(targetEntity ? { targetEntity } : {}),
    ...(timeRange !== undefined ? { timeRange } : {}),
    ...(filters?.length ? { filters } : {}),
    ...(metrics?.length ? { metrics } : {}),
    ...(groupBy?.length ? { groupBy } : {}),
    ...(orderBy?.length ? { orderBy } : {}),
    limit: input.limit ?? defaultLimitForIntent(intent),
    confidence,
    ...(assumptions?.length ? { assumptions } : {}),
    ...(missingSlots.length ? { missingSlots } : {}),
    ...(notes?.length ? { notes } : {}),
    ...(normalizedMetadata !== undefined ? { metadata: normalizedMetadata } : {}),
  };
}
