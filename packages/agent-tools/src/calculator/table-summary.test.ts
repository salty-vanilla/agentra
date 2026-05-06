import { describe, expect, it } from 'vitest';
import { summarizeTable } from './table-summary.js';

describe('summarizeTable', () => {
  it('aggregates only finite numeric columns in first-seen order', () => {
    const summary = summarizeTable([
      { b: 2, a: 'x', c: NaN, d: Infinity },
      { a: 1, b: 4, c: 3, e: true },
      { c: 5, d: -1, b: null },
    ]);

    expect(summary.rowCount).toBe(3);
    expect(summary.numericColumns).toEqual([
      {
        column: 'b',
        count: 2,
        sum: 6,
        average: 3,
        min: 2,
        max: 4,
      },
      {
        column: 'a',
        count: 1,
        sum: 1,
        average: 1,
        min: 1,
        max: 1,
      },
      {
        column: 'c',
        count: 2,
        sum: 8,
        average: 4,
        min: 3,
        max: 5,
      },
      {
        column: 'd',
        count: 1,
        sum: -1,
        average: -1,
        min: -1,
        max: -1,
      },
    ]);
  });
});
