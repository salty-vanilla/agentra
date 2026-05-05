import { buildBrandFramePromptSection } from './brand-frame/prompts.js';
import type { BrandFrame } from './brand-frame/types.js';
import { buildIconPromptSection } from './icons/prompts.js';
import type { IconManifest } from './icons/types.js';
import { buildImageToolGuidance } from './images/prompts.js';
import type { PresentationAuthorInput } from './types.js';

export function buildAuthoringPrompt(
  input: PresentationAuthorInput,
  options?: {
    brandFrame?: BrandFrame | undefined;
    iconManifest?: IconManifest | undefined;
    imagesEnabled?: boolean | undefined;
    imageGenerationEnabled?: boolean | undefined;
  },
): string {
  const lang = input.language ?? 'ja';
  const langInstruction =
    lang === 'ja'
      ? 'スライドのテキストはすべて日本語で記述してください。'
      : 'Write all slide text in English.';

  const parts: string[] = [
    'You are a presentation authoring assistant.',
    'Return ONLY valid JavaScript code. No markdown fences, no prose, no explanation.',
    '',
    'Requirements:',
    '- Write a complete Node.js script that uses the "pptxgenjs" package.',
    '- Use `const pptxgen = require("pptxgenjs");` to import.',
    '- Import helpers: `const { safeOuterShadow } = require("./helpers/pptxgenjs_helpers/util");`',
    '- Import layout helpers: `const { warnIfSlideHasOverlaps, warnIfSlideElementsOutOfBounds } = require("./helpers/pptxgenjs_helpers/layout");`',
    '- Create an editable PowerPoint deck with `pptx.layout = "LAYOUT_WIDE"` (16:9).',
    '- Set explicit theme fonts (e.g. Arial or Meiryo).',
    '- Minimum font size: 14pt for body text, 24pt for titles.',
    '- Maximum 6 bullet items per slide. Split content across slides if needed.',
    '- Size text boxes generously. When uncertain, prefer larger boxes and smaller font sizes to avoid overflow.',
    '- Call `warnIfSlideHasOverlaps(slide, pptx)` and `warnIfSlideElementsOutOfBounds(slide, pptx)` after adding elements to each slide.',
    '- Prefer native PowerPoint charts for simple data visualizations.',
    '- Do not rasterize text into images.',
    '- Save output exactly as `deck.pptx` in the current working directory: `await pptx.writeFile({ fileName: "deck.pptx" });`',
    '- Wrap execution in an async main() and call `main().catch(err => { console.error(err); process.exit(1); });`',
    '',
    'PptxGenJS API notes:',
    '- Shape types: use `pptx.ShapeType.rect`, `pptx.ShapeType.ellipse`, `pptx.ShapeType.roundRect`, etc. Do NOT use `pptx.shapes.RECTANGLE` (does not exist).',
    '- Shadow: always use `safeOuterShadow(color, opacity)` helper. The `color` argument must be a hex string like "333333". Never pass a number or object.',
    '- addShape returns void. Chain like: `slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:13.33, h:7.5, fill:{ color:"003366" } });`',
    '',
    'Forbidden:',
    '- Do not use child_process, exec, spawn.',
    '- Do not use fs.rm, fs.unlink, fs.rmdir, or any destructive file operations.',
    '- Do not use network access (fetch, http, https, curl, wget).',
    '- Do not require local files unless explicitly provided.',
    '',
    langInstruction,
  ];

  if (input.styleGuide) {
    parts.push('', `Style guide: ${input.styleGuide}`);
  }

  if (input.templatePath) {
    parts.push('', `Template file available at: ${input.templatePath}`);
  }

  if (options?.brandFrame) {
    parts.push('', buildBrandFramePromptSection(options.brandFrame));
  }

  if (options?.iconManifest) {
    parts.push('', buildIconPromptSection(options.iconManifest));
  }

  if (options?.imagesEnabled) {
    parts.push(
      '',
      buildImageToolGuidance(options.imageGenerationEnabled ? 'auto' : 'retrieve'),
    );
  }

  parts.push('', '---', '', `User request: ${input.prompt}`);

  return parts.join('\n');
}
