import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('structured query execute bedrock stub tool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns a not implemented execution result for a valid structured query plan', async () => {
    const { executeStructuredQueryExecuteBedrockStubTool } = await import(
      '../../tools/structured-query-execute-bedrock-stub.tool.js'
    );

    const response = await executeStructuredQueryExecuteBedrockStubTool({
      plan: {
        id: 'plan-123',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload.status).toBe('not_implemented');
    expect(payload.plan).toMatchObject({
      id: 'plan-123',
      intent: 'kpi_aggregation',
      dataSourceKind: 'bedrock_kb_structured',
    });
    expect(payload.summary).toMatchObject({
      status: 'not_implemented',
      rowCount: 0,
      columnNames: [],
      dataSourceKind: 'bedrock_kb_structured',
      intent: 'kpi_aggregation',
      dryRun: true,
    });
    expect(payload).not.toHaveProperty('sql');
    expect(payload).not.toHaveProperty('rawProviderResponse');
  });

  it('rejects an empty plan id', async () => {
    const { executeStructuredQueryExecuteBedrockStubTool } = await import(
      '../../tools/structured-query-execute-bedrock-stub.tool.js'
    );

    const response = await executeStructuredQueryExecuteBedrockStubTool({
      plan: {
        id: '   ',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
      },
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain(
      'Too small: expected string to have >=1 characters',
    );
  });

  it('rejects metadata with too many keys', async () => {
    const { executeStructuredQueryExecuteBedrockStubTool } = await import(
      '../../tools/structured-query-execute-bedrock-stub.tool.js'
    );

    const response = await executeStructuredQueryExecuteBedrockStubTool({
      plan: {
        id: 'plan-123',
        createdAt: '2026-05-09T00:00:00.000Z',
        intent: 'kpi_aggregation',
        dataSourceKind: 'bedrock_kb_structured',
        question: 'Show KPI aggregation for line A',
        confidence: 0.9,
        metadata: Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [`key-${index}`, index]),
        ),
      },
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('must not exceed 100 keys');
  });
});
