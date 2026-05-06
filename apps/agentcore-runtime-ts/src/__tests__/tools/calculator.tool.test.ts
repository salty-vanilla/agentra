import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('calculator tool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns success for percentage_change', async () => {
    const { executeCalculatorTool } = await import('../../tools/calculator.tool.js');
    const response = executeCalculatorTool({
      operation: 'percentage_change',
      values: [120, 100],
    });

    expect(response.status).toBe('success');
    expect(response.content[0]?.text).toBe(
      JSON.stringify({ operation: 'percentage_change', value: 20, inputCount: 2 }),
    );
  });

  it('returns error for division by zero', async () => {
    const { executeCalculatorTool } = await import('../../tools/calculator.tool.js');
    const response = executeCalculatorTool({
      operation: 'ratio',
      values: [1, 0],
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('Division by zero');
  });
});
