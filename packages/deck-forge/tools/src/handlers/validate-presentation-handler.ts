import { validatePresentation } from "@deck-forge/core";

import type { ValidatePresentationInput, ValidatePresentationOutput } from "#src/types.js";

export async function validatePresentationHandler(
  input: ValidatePresentationInput,
): Promise<ValidatePresentationOutput> {
  const report = await validatePresentation(input.presentation, { level: input.level ?? "basic" });
  return { report };
}
