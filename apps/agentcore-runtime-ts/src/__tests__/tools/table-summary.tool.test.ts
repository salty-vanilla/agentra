import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('table summary tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('summarizes numeric columns', async () => {
    const { executeTableSummaryTool } = await import('../../tools/table-summary.tool.js');
    const rows = [
      { name: 'a', value: 1, count: 2 },
      { name: 'b', value: 3, count: 4 },
    ];

    const response = executeTableSummaryTool(rows);

    expect(response.status).toBe('success');
    expect(response.content[0]?.text).toBe(
      JSON.stringify({
        rowCount: 2,
        numericColumns: [
          { column: 'value', count: 2, sum: 4, average: 2, min: 1, max: 3 },
          { column: 'count', count: 2, sum: 6, average: 3, min: 2, max: 4 },
        ],
      }),
    );
    expect(rows).toEqual([
      { name: 'a', value: 1, count: 2 },
      { name: 'b', value: 3, count: 4 },
    ]);
  });

  it('rejects oversized input', async () => {
    const { executeTableSummaryTool } = await import('../../tools/table-summary.tool.js');
    const rows = Array.from({ length: 1001 }, (_, index) => ({ value: index }));

    const response = executeTableSummaryTool(rows);

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('rows must not exceed 1000');
  });
});
