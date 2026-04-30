import { generateAssetPlan } from "@deck-forge/core";

import type { GenerateAssetPlanInput, GenerateAssetPlanOutput } from "#src/types.js";

export async function generateAssetPlanHandler(
  input: GenerateAssetPlanInput,
): Promise<GenerateAssetPlanOutput> {
  return generateAssetPlan(input);
}
