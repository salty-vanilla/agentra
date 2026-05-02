export type {
  TemplateProfile,
  TemplateLayoutProfile,
  TemplateLayoutKind,
  TemplateSlotName,
} from "#src/templates/template-profile.js";

export { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";
export { MINIMAL_TEMPLATE_PROFILE } from "#src/templates/builtins/minimal-default.js";

export {
  resolveTemplateLayout,
} from "#src/templates/resolve-template-layout.js";
export type {
  ResolveTemplateLayoutInput,
  ResolveTemplateLayoutOutput,
} from "#src/templates/resolve-template-layout.js";
