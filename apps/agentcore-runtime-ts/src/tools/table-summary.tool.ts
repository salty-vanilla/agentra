import { summarizeTable } from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_TABLE_ROWS = 1000;
const MAX_TABLE_COLUMNS = 100;

const tableRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const tableSummaryInputSchema = z.object({
  rows: z
    .array(tableRowSchema)
    .describe('Small table represented as an array of row objects.'),
});

type TableSummaryRow = Record<string, string | number | boolean | null | undefined>;
type TableSummaryToolInput = {
  rows: TableSummaryRow[];
};

function validateTableBounds(rows: TableSummaryRow[]): void {
  if (rows.length > MAX_TABLE_ROWS) {
    throw new Error(`rows must not exceed ${MAX_TABLE_ROWS}`);
  }

  for (const [index, row] of rows.entries()) {
    if (Object.keys(row).length > MAX_TABLE_COLUMNS) {
      throw new Error(`row ${index + 1} must not exceed ${MAX_TABLE_COLUMNS} columns`);
    }
  }
}

export function executeTableSummaryTool(input: TableSummaryToolInput) {
  try {
    validateTableBounds(input.rows);
    return toolSuccess(summarizeTable(input.rows));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const tableSummaryTool = tool({
  name: 'table_summary',
  description:
    'Summarize numeric columns in a small table. Use this for deterministic row counts, sums, averages, min, and max values.',
  inputSchema: tableSummaryInputSchema,
  callback: executeTableSummaryTool,
});

export { tableSummaryTool };
