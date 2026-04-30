import { applyOperations } from "@deck-forge/core";

import type { UpdateChartDataInput, UpdateChartDataOutput } from "#src/types.js";

export async function updateChartDataHandler(
  input: UpdateChartDataInput,
): Promise<UpdateChartDataOutput> {
  const presentation = await applyOperations(input.presentation, [input.operation]);
  return { presentation };
}
