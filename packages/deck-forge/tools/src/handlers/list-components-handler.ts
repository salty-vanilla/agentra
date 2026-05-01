import { listComponents } from "@deck-forge/core";

import type { ListComponentsInput, ListComponentsOutput } from "#src/types.js";

export async function listComponentsHandler(
  input: ListComponentsInput,
): Promise<ListComponentsOutput> {
  const catalog = await listComponents({
    componentsDir: input.componentsDir,
  });
  return { catalog };
}
