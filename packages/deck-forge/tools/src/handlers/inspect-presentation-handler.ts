import { inspectPresentation } from "@deck-forge/core";

import type { InspectPresentationInput, InspectPresentationOutput } from "#src/types.js";

export async function inspectPresentationHandler(
  input: InspectPresentationInput,
): Promise<InspectPresentationOutput> {
  const result = await inspectPresentation(input.presentation, input.query);
  return { result };
}
