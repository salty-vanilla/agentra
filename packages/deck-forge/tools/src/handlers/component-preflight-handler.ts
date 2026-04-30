import { preflightComponents } from "@deck-forge/core";

import type { ComponentPreflightInput, ComponentPreflightOutput } from "#src/types.js";

export async function componentPreflightHandler(
  input: ComponentPreflightInput,
): Promise<ComponentPreflightOutput> {
  const result = await preflightComponents(input.slideSpecs, {
    componentsDir: input.componentsDir,
  });
  return { result };
}
