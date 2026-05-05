import type { IconManifest } from './types.js';

export function buildIconPromptSection(manifest: IconManifest): string {
  const iconList = manifest.icons.map((icon) => `- ${icon.id}`).join('\n');

  return `Icon Provider:

A curated local icon set is available in the workspace.

Use icons sparingly to improve readability:
- KPI / metrics slides
- risk / issue slides
- quality / compliance slides
- action plan / task slides
- timeline / schedule slides
- factory / production line topics
- improvement / trend slides

Do not use icons as decoration only.
Do not overcrowd slides with icons.
Use at most 1-4 icons per slide.
Keep icon sizes consistent: 0.18in-0.35in for inline icons, 0.4in-0.7in for card/header icons.
Place icons inside the safe content area.
Do not overlap company header/footer.

Import helper:

const { addIcon } = require("./helpers/icons");

Example:

addIcon(slide, "factory", { x: 0.5, y: 1.2, w: 0.35, h: 0.35 });
addIcon(slide, "trending-up", { x: 0.5, y: 2.0, w: 0.3, h: 0.3 });

strokeColor option — match icons to your slide color palette:

addIcon(slide, "factory", { x: 0.5, y: 1.2, w: 0.35, h: 0.35, strokeColor: "#1a365d" });

Choose strokeColor to contrast with the slide background. Default is "#333333".

Available icon IDs:
${iconList}`;
}
