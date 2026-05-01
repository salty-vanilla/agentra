import { synthesizeComponents } from "@deck-forge/core";

import type { ComponentSynthesizeInput, ComponentSynthesizeOutput } from "#src/types.js";

export async function componentSynthesizeHandler(
  input: ComponentSynthesizeInput,
): Promise<ComponentSynthesizeOutput> {
  const { created, catalog } = await synthesizeComponents(input.slideSpecs, {
    componentsDir: input.componentsDir,
  });
  return { created, catalog };
}
