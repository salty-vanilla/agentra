import { generateDeckPlan } from "@deck-forge/core";

import type { GenerateDeckPlanInput, GenerateDeckPlanOutput } from "#src/types.js";

export async function generateDeckPlanHandler(
  input: GenerateDeckPlanInput,
): Promise<GenerateDeckPlanOutput> {
  return generateDeckPlan(input);
}
