export type TableRow = Record<string, string | number | boolean | null | undefined>;

export type NumericColumnSummary = {
  column: string;
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
};

export type TableSummary = {
  rowCount: number;
  numericColumns: NumericColumnSummary[];
};

type Accumulator = {
  column: string;
  count: number;
  sum: number;
  min: number;
  max: number;
};

export function summarizeTable(rows: TableRow[]): TableSummary {
  const columns = new Map<string, Accumulator>();

  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }

      const existing = columns.get(column);
      if (existing) {
        existing.count += 1;
        existing.sum += value;
        existing.min = Math.min(existing.min, value);
        existing.max = Math.max(existing.max, value);
        continue;
      }

      columns.set(column, {
        column,
        count: 1,
        sum: value,
        min: value,
        max: value,
      });
    }
  }

  return {
    rowCount: rows.length,
    numericColumns: [...columns.values()].map((entry) => ({
      column: entry.column,
      count: entry.count,
      sum: entry.sum,
      average: entry.sum / entry.count,
      min: entry.min,
      max: entry.max,
    })),
  };
}
