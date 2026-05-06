import { calculate } from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

type CalculatorToolInput = {
  operation:
    | 'sum'
    | 'average'
    | 'min'
    | 'max'
    | 'count'
    | 'difference'
    | 'ratio'
    | 'percentage'
    | 'percentage_change';
  values: number[];
};

const calculatorInputSchema = z.object({
  operation: z.enum([
    'sum',
    'average',
    'min',
    'max',
    'count',
    'difference',
    'ratio',
    'percentage',
    'percentage_change',
  ]),
  values: z.array(z.number()).describe('Numeric values used by the selected operation.'),
});

export function executeCalculatorTool(input: CalculatorToolInput) {
  try {
    return toolSuccess(calculate(input));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const calculatorTool = tool({
  name: 'calculator',
  description:
    'Perform deterministic numeric calculations such as sum, average, ratio, percentage, and percentage change. Use this instead of mental arithmetic for KPI, metric, and slide calculations.',
  inputSchema: calculatorInputSchema,
  callback: executeCalculatorTool,
});

export { calculatorTool };
