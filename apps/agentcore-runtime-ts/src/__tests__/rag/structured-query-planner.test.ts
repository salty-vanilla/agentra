import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured query planner', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a deterministic plan for an explicit intent', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: '  Show error code history for line A  ',
      intent: 'error_code_lookup',
      targetEntity: ' line A ',
      filters: [{ field: '  error_code  ', operator: 'equals', value: 'E101' }],
      metadata: { source: 'manual' },
    });

    expect(plan.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(plan.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(plan.intent).toBe('error_code_lookup');
    expect(plan.confidence).toBe(0.9);
    expect(plan.dataSourceKind).toBe('bedrock_kb_structured');
    expect(plan.question).toBe('Show error code history for line A');
    expect(plan.targetEntity).toBe('line A');
    expect(plan.limit).toBe(10);
    expect(plan.metadata).toEqual({
      source: 'manual',
      planner: 'deterministic-structured-query-planner',
    });
  });

  it('infers error code lookup from Japanese keywords', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: 'エラーコードを調べたい',
    });

    expect(plan.intent).toBe('error_code_lookup');
    expect(plan.confidence).toBe(0.65);
    expect(plan.limit).toBe(10);
  });

  it('infers temperature anomaly summary and missing slots', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: '温度 異常 の傾向を見たい',
    });

    expect(plan.intent).toBe('temperature_anomaly_summary');
    expect(plan.missingSlots).toEqual(
      expect.arrayContaining(['line or equipment', 'time range']),
    );
  });

  it('infers KPI aggregation from keywords', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: 'KPI の平均と合計を見たい',
    });

    expect(plan.intent).toBe('kpi_aggregation');
    expect(plan.confidence).toBe(0.65);
    expect(plan.limit).toBe(20);
  });

  it('returns unknown intent for unrelated questions', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: 'Tell me something unrelated',
    });

    expect(plan.intent).toBe('unknown');
    expect(plan.confidence).toBe(0.3);
    expect(plan.limit).toBe(50);
    expect(plan.missingSlots).toEqual(expect.arrayContaining(['intent', 'data source']));
  });

  it('trims and deduplicates arrays', async () => {
    const { createStructuredQueryPlan } = await import(
      '../../rag/structured-query-planner.js'
    );

    const plan = createStructuredQueryPlan({
      question: 'production trend',
      groupBy: [' line ', 'line', '', 'machine'],
      assumptions: ['  first  ', 'first', 'second'],
      notes: ['note', ' note '],
    });

    expect(plan.groupBy).toEqual(['line', 'machine']);
    expect(plan.assumptions).toEqual(['first', 'second']);
    expect(plan.notes).toEqual(['note']);
  });
});
