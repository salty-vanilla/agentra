import { applyOperations } from "@deck-forge/core";

import type { AddChartInput, AddChartOutput } from "#src/types.js";

export async function addChartHandler(input: AddChartInput): Promise<AddChartOutput> {
  const presentation = await applyOperations(input.presentation, [input.operation]);
  return { presentation };
}
