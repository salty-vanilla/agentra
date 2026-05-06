export type CalculatorOperation =
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'count'
  | 'difference'
  | 'ratio'
  | 'percentage'
  | 'percentage_change';

export type CalculatorInput = {
  operation: CalculatorOperation;
  values: number[];
};

export type CalculatorOutput = {
  operation: CalculatorOperation;
  value: number;
  inputCount: number;
};

function ensureFiniteNumbers(values: number[]): void {
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('Calculator input must contain only finite numbers.');
    }
  }
}

function ensureMinimumValues(values: number[], minimum: number): void {
  if (values.length < minimum) {
    throw new Error(`Calculator operation requires at least ${minimum} value(s).`);
  }
}

function ensureNonZero(value: number): void {
  if (value === 0) {
    throw new Error('Division by zero is not allowed.');
  }
}

function readPair(values: number[]): [number, number] {
  const left = values[0];
  const right = values[1];
  if (left === undefined || right === undefined) {
    throw new Error('Calculator operation requires at least 2 value(s).');
  }
  return [left, right];
}

export function calculate(input: CalculatorInput): CalculatorOutput {
  ensureFiniteNumbers(input.values);

  let value: number;
  switch (input.operation) {
    case 'sum':
      ensureMinimumValues(input.values, 1);
      value = input.values.reduce((total, entry) => total + entry, 0);
      break;
    case 'average':
      ensureMinimumValues(input.values, 1);
      value =
        input.values.reduce((total, entry) => total + entry, 0) / input.values.length;
      break;
    case 'min':
      ensureMinimumValues(input.values, 1);
      value = Math.min(...input.values);
      break;
    case 'max':
      ensureMinimumValues(input.values, 1);
      value = Math.max(...input.values);
      break;
    case 'count':
      value = input.values.length;
      break;
    case 'difference':
      ensureMinimumValues(input.values, 2);
      {
        const [left, right] = readPair(input.values);
        value = left - right;
      }
      break;
    case 'ratio':
      ensureMinimumValues(input.values, 2);
      {
        const [left, right] = readPair(input.values);
        ensureNonZero(right);
        value = left / right;
      }
      break;
    case 'percentage':
      ensureMinimumValues(input.values, 2);
      {
        const [left, right] = readPair(input.values);
        ensureNonZero(right);
        value = (left / right) * 100;
      }
      break;
    case 'percentage_change':
      ensureMinimumValues(input.values, 2);
      {
        const [left, right] = readPair(input.values);
        ensureNonZero(right);
        value = ((left - right) / right) * 100;
      }
      break;
    default:
      throw new Error(`Unsupported calculator operation: ${String(input.operation)}`);
  }

  if (!Number.isFinite(value)) {
    throw new Error('Calculator result must be finite.');
  }

  return {
    operation: input.operation,
    value,
    inputCount: input.values.length,
  };
}
