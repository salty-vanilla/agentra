import type {
  StructuredQueryExecutionInput,
  StructuredQueryExecutionOutput,
  StructuredQueryProvider,
} from './structured-query-executor-types.js';

export class StructuredQueryExecutor {
  constructor(private readonly provider: StructuredQueryProvider) {}

  execute(input: StructuredQueryExecutionInput): Promise<StructuredQueryExecutionOutput> {
    return this.provider.execute(input);
  }
}
