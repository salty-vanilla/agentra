import type { PresentationIR } from "#src/index.js";
import type { ApplyThemeOperation } from "#src/operations/types.js";

export function applyTheme(presentation: PresentationIR, operation: ApplyThemeOperation): void {
  presentation.theme = operation.theme;
}
