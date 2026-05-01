/**
 * Conservative table height estimation utilities.
 */

const DEFAULT_MIN_ROW_HEIGHT = 24;
const DEFAULT_ROW_PADDING = 12;

/**
 * Estimate the pixel height of a single table row.
 *
 * `max(minRowHeight, fontSize * 1.4 + rowPadding)`
 */
export function estimateTableRowHeight(input: {
  fontSize: number;
  rowPadding?: number;
  minRowHeight?: number;
}): number {
  const { fontSize } = input;
  const rowPadding = input.rowPadding ?? DEFAULT_ROW_PADDING;
  const minRowHeight = input.minRowHeight ?? DEFAULT_MIN_ROW_HEIGHT;
  return Math.max(minRowHeight, fontSize * 1.4 + rowPadding);
}

/**
 * Estimate the total pixel height of a table.
 *
 * Total rendered rows = headerRows + body rows.
 * The `rowCount` parameter should be the number of **body** rows only;
 * `headerRows` (default 1) is added automatically.
 */
export function estimateTableHeight(input: {
  rowCount: number;
  headerRows?: number;
  fontSize: number;
  rowPadding?: number;
  minRowHeight?: number;
}): number {
  const headerRows = input.headerRows ?? 1;
  const totalRows = headerRows + input.rowCount;
  const rowHeight = estimateTableRowHeight({
    fontSize: input.fontSize,
    rowPadding: input.rowPadding,
    minRowHeight: input.minRowHeight,
  });
  return totalRows * rowHeight;
}
