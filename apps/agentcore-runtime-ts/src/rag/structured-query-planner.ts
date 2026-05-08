import { uuidv7 } from 'uuidv7';
import type {
  StructuredQueryDataSourceKind,
  StructuredQueryFilter,
  StructuredQueryIntent,
  StructuredQueryMetric,
  StructuredQueryPlan,
  StructuredQueryPlanInput,
  StructuredQueryTimeRange,
} from './structured-query-types.js';

type KeywordIntent = Exclude<StructuredQueryIntent, 'generic_lookup' | 'unknown'>;

const INTENT_PRIORITY: KeywordIntent[] = [
  'error_code_lookup',
  'temperature_anomaly_summary',
  'kpi_aggregation',
  'equipment_history_lookup',
  'production_trend',
];

const INTENT_KEYWORDS: Record<KeywordIntent, string[]> = {
  error_code_lookup: ['error code', 'error_code', 'エラーコード', 'アラーム', 'alarm'],
  temperature_anomaly_summary: ['temperature', 'temp', '温度', '異常', 'anomaly'],
  kpi_aggregation: ['kpi', '平均', '合計', '集計', 'average', 'sum', 'count'],
  equipment_history_lookup: [
    'equipment',
    '設備',
    '履歴',
    'history',
    'maintenance',
    '保全',
  ],
  production_trend: ['production', '生産', 'trend', '推移', '時系列'],
};

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
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return {
    ...metadata,
    planner: 'deterministic-structured-query-planner',
  };
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
  if (intent === 'error_code_lookup') {
    return 10;
  }

  if (
    intent === 'temperature_anomaly_summary' ||
    intent === 'kpi_aggregation' ||
    intent === 'equipment_history_lookup' ||
    intent === 'production_trend'
  ) {
    return 20;
  }

  return 50;
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

  switch (intent) {
    case 'error_code_lookup':
      if (!targetEntity) {
        missing.add('errorCode or equipment');
      }
      if (!filters?.length) {
        missing.add('error code filter');
      }
      break;
    case 'temperature_anomaly_summary':
      if (!targetEntity) {
        missing.add('line or equipment');
      }
      if (!hasTimeRange(timeRange)) {
        missing.add('time range');
      }
      break;
    case 'kpi_aggregation':
      if (!metrics?.length) {
        missing.add('metrics');
      }
      if (!hasTimeRange(timeRange)) {
        missing.add('time range');
      }
      break;
    case 'equipment_history_lookup':
      if (!targetEntity) {
        missing.add('equipment');
      }
      if (!hasTimeRange(timeRange)) {
        missing.add('time range');
      }
      break;
    case 'production_trend':
      if (!hasTimeRange(timeRange)) {
        missing.add('time range');
      }
      if (!metrics?.length) {
        missing.add('production metric');
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
  const timeRange = normalizeTimeRange(input.timeRange);
  const targetEntity = trimText(input.targetEntity);
  const filters = normalizeFilters(input.filters);
  const metrics = normalizeMetricArray(input.metrics);
  const groupBy = normalizeStringArray(input.groupBy);
  const orderBy = normalizeOrderBy(input.orderBy);
  const assumptions = normalizeStringArray(input.assumptions);
  const notes = normalizeStringArray(input.notes);
  const normalizedMetadata = normalizeMetadata(input.metadata);
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
    dataSourceKind: input.dataSourceKind ?? DEFAULT_DATA_SOURCE_KIND,
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
