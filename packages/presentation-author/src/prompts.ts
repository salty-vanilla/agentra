import type { PresentationAuthorInput } from './types.js';

export function buildAuthoringPrompt(input: PresentationAuthorInput): string {
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

  parts.push('', '---', '', `User request: ${input.prompt}`);

  return parts.join('\n');
}
