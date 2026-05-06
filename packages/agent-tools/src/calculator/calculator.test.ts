import { describe, expect, it } from 'vitest';
import { calculate } from './calculator.js';

describe('calculate', () => {
  it('computes sum, average, and percentage_change', () => {
    expect(calculate({ operation: 'sum', values: [1, 2, 3] })).toMatchObject({
      operation: 'sum',
      value: 6,
      inputCount: 3,
    });
    expect(calculate({ operation: 'average', values: [2, 4, 6] })).toMatchObject({
      operation: 'average',
      value: 4,
      inputCount: 3,
    });
    expect(
      calculate({ operation: 'percentage_change', values: [120, 100] }),
    ).toMatchObject({
      operation: 'percentage_change',
      value: 20,
      inputCount: 2,
    });
  });

  it('throws on division by zero', () => {
    expect(() => calculate({ operation: 'ratio', values: [1, 0] })).toThrow(
      /Division by zero/,
    );
  });

  it('throws on insufficient input', () => {
    expect(() => calculate({ operation: 'difference', values: [1] })).toThrow(
      /at least 2 value\(s\)/,
    );
  });
});
