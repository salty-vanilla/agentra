export type StructuredQueryIntent =
  | 'error_code_lookup'
  | 'anomaly_summary'
  | 'kpi_aggregation'
  | 'equipment_history_lookup'
  | 'production_trend'
  | 'generic_lookup'
  | 'unknown';

export type StructuredQueryDataSourceKind =
  | 'bedrock_kb_structured'
  | 'athena'
  | 'redshift'
  | 'rds'
  | 'dynamodb'
  | 'mock'
  | 'unknown';

export type StructuredQueryTimeRange = {
  start?: string | undefined;
  end?: string | undefined;
  timezone?: string | undefined;
};

export type StructuredQueryFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'in'
  | 'greater_than'
  | 'greater_than_or_equals'
  | 'less_than'
  | 'less_than_or_equals';

export type StructuredQueryFilter = {
  field: string;
  operator: StructuredQueryFilterOperator;
  value: string | number | boolean | Array<string | number | boolean>;
};

export type StructuredQueryMetric =
  | 'count'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'rate'
  | 'trend'
  | 'top_n'
  | 'unknown';

export type StructuredQueryPlan = {
  id: string;
  createdAt: string;
  intent: StructuredQueryIntent;
  dataSourceKind: StructuredQueryDataSourceKind;
  question: string;
  targetEntity?: string | undefined;
  timeRange?: StructuredQueryTimeRange | undefined;
  filters?: StructuredQueryFilter[] | undefined;
  metrics?: StructuredQueryMetric[] | undefined;
  groupBy?: string[] | undefined;
  orderBy?:
    | Array<{
        field: string;
        direction: 'asc' | 'desc';
      }>
    | undefined;
  limit?: number | undefined;
  confidence: number;
  assumptions?: string[] | undefined;
  missingSlots?: string[] | undefined;
  notes?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type StructuredQueryPlanInput = {
  question: string;
  intent?: StructuredQueryIntent | undefined;
  dataSourceKind?: StructuredQueryDataSourceKind | undefined;
  targetEntity?: string | undefined;
  timeRange?: StructuredQueryTimeRange | undefined;
  filters?: StructuredQueryFilter[] | undefined;
  metrics?: StructuredQueryMetric[] | undefined;
  groupBy?: string[] | undefined;
  orderBy?:
    | Array<{
        field: string;
        direction: 'asc' | 'desc';
      }>
    | undefined;
  limit?: number | undefined;
  assumptions?: string[] | undefined;
  notes?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};
