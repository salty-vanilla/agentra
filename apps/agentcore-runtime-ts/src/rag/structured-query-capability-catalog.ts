import type {
  StructuredQueryDataSourceKind,
  StructuredQueryIntent,
} from './structured-query-types.js';

export type StructuredQueryCatalogIntent = Exclude<
  StructuredQueryIntent,
  'generic_lookup' | 'unknown'
>;

export type StructuredQueryCapabilitySlot =
  | 'error code or equipment'
  | 'error code filter'
  | 'target entity'
  | 'signal or metric'
  | 'time range'
  | 'metrics'
  | 'equipment'
  | 'production metric';

export type StructuredQueryCapability = {
  readonly intent: StructuredQueryCatalogIntent;
  readonly keywords: readonly string[];
  readonly requiredSlots: readonly StructuredQueryCapabilitySlot[];
  readonly defaultLimit: number;
  readonly dataSourceKind: StructuredQueryDataSourceKind;
  readonly description: string;
  readonly exampleSignals?: readonly string[];
};

/**
 * Lightweight query capability catalog.
 *
 * This is routing and validation metadata, not a physical warehouse schema or
 * a source-of-truth table catalog. The structured data itself still lives in
 * Bedrock KB / Redshift / Glue / warehouse-side metadata.
 */
export const STRUCTURED_QUERY_CAPABILITY_CATALOG = {
  error_code_lookup: {
    intent: 'error_code_lookup',
    keywords: ['error code', 'error_code', 'エラーコード', 'アラーム', 'alarm'],
    requiredSlots: ['error code or equipment', 'error code filter'] as const,
    defaultLimit: 10,
    dataSourceKind: 'bedrock_kb_structured',
    description: 'Look up error codes and related equipment context.',
  },
  anomaly_summary: {
    intent: 'anomaly_summary',
    keywords: ['anomaly', 'abnormal', '異常', '外れ値', 'outlier'],
    requiredSlots: ['target entity', 'signal or metric', 'time range'] as const,
    defaultLimit: 20,
    dataSourceKind: 'bedrock_kb_structured',
    description:
      'Summarize anomalies for a target entity and signal without hard-coding a specific sensor column.',
    exampleSignals: ['temperature', 'pressure', 'current', 'vibration', 'humidity'],
  },
  kpi_aggregation: {
    intent: 'kpi_aggregation',
    keywords: ['kpi', '平均', '合計', '集計', 'average', 'sum', 'count'],
    requiredSlots: ['metrics', 'time range'] as const,
    defaultLimit: 20,
    dataSourceKind: 'bedrock_kb_structured',
    description: 'Aggregate KPI metrics over a time range.',
  },
  equipment_history_lookup: {
    intent: 'equipment_history_lookup',
    keywords: ['equipment', '設備', '履歴', 'history', 'maintenance', '保全'],
    requiredSlots: ['equipment', 'time range'] as const,
    defaultLimit: 20,
    dataSourceKind: 'bedrock_kb_structured',
    description: 'Look up equipment history and maintenance context.',
  },
  production_trend: {
    intent: 'production_trend',
    keywords: ['production', '生産', 'trend', '推移', '時系列'],
    requiredSlots: ['time range', 'production metric'] as const,
    defaultLimit: 20,
    dataSourceKind: 'bedrock_kb_structured',
    description: 'Summarize production trends over time.',
  },
} as const satisfies Record<StructuredQueryCatalogIntent, StructuredQueryCapability>;

export const STRUCTURED_QUERY_INTENT_PRIORITY: StructuredQueryCatalogIntent[] = [
  'error_code_lookup',
  'anomaly_summary',
  'kpi_aggregation',
  'equipment_history_lookup',
  'production_trend',
];
