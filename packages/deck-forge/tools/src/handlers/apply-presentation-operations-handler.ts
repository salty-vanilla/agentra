import { applyOperations } from "@deck-forge/core";

import type {
  ApplyPresentationOperationsInput,
  ApplyPresentationOperationsOutput,
} from "#src/types.js";

export async function applyPresentationOperationsHandler(
  input: ApplyPresentationOperationsInput,
): Promise<ApplyPresentationOperationsOutput> {
  const presentation = await applyOperations(input.presentation, input.operations);
  return { presentation };
}
