import type { RagProvider, RagSearchInput, RagSearchOutput } from './types.js';

export class RagService {
  constructor(private readonly provider: RagProvider) {}

  search(input: RagSearchInput): Promise<RagSearchOutput> {
    return this.provider.search(input);
  }
}
