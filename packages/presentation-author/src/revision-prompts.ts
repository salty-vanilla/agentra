import type { PresentationDiagnosticsResult } from './diagnostics.js';
import type { PresentationLanguage } from './types.js';

export interface BuildSingleRevisionPromptInput {
  originalUserPrompt: string;
  language?: PresentationLanguage | undefined;
  previousCode: string;
  diagnostics?: PresentationDiagnosticsResult | undefined;
}

export function buildSingleRevisionPrompt(input: BuildSingleRevisionPromptInput): string {
  const lang = input.language ?? 'ja';
  const langInstruction =
    lang === 'ja'
      ? 'スライドのテキストはすべて日本語で記述してください。'
      : 'Write all slide text in English.';

  const parts: string[] = [
    'You are a presentation authoring assistant performing a revision pass.',
    'You previously generated a PptxGenJS script. The script ran but diagnostics found issues.',
    '',
    'Return ONLY the full revised JavaScript code. No markdown fences, no prose, no explanation.',
    '',
    '## Original user request',
    '',
    input.originalUserPrompt,
    '',
    `## Language: ${langInstruction}`,
    '',
    '## Previous script',
    '',
    '```javascript',
    input.previousCode,
    '```',
    '',
  ];

  if (input.diagnostics) {
    parts.push('## Diagnostics summary', '');
    parts.push(`Status: ${input.diagnostics.status}`, '');

    if (input.diagnostics.overflow) {
      const ov = input.diagnostics.overflow;
      if (ov.passed) {
        parts.push('Overflow: PASS (no overflow detected)');
      } else {
        const slides = ov.overflowSlideNumbers.join(', ');
        parts.push(`Overflow: FAIL — slides with overflow: ${slides || 'unknown'}`);
      }
    }

    if (input.diagnostics.fonts) {
      const f = input.diagnostics.fonts;
      if (f.missingFonts.length > 0) {
        parts.push(`Missing fonts: ${f.missingFonts.join(', ')}`);
      }
      if (f.substitutedFonts.length > 0) {
        parts.push(`Substituted fonts: ${f.substitutedFonts.join(', ')}`);
      }
    }

    if (input.diagnostics.render) {
      const r = input.diagnostics.render;
      if (!r.success) {
        parts.push('Render: FAILED — slides could not be rendered to PNG');
      } else {
        parts.push(`Render: OK — ${r.slideCount} slides rendered`);
      }
    }

    if (input.diagnostics.contactSheet) {
      const cs = input.diagnostics.contactSheet;
      if (!cs.success) {
        parts.push('Contact sheet: FAILED');
      }
    }

    if (input.diagnostics.warnings.length > 0) {
      parts.push('', 'Warnings:');
      for (const w of input.diagnostics.warnings) {
        parts.push(`- ${w}`);
      }
    }
    parts.push('');
  }

  parts.push(
    '## Revision instructions',
    '',
    'Fix the diagnostics issues listed above. Priority:',
    '1. Fix any render failures',
    '2. Fix content overflow on flagged slides (reduce text, increase area, split content)',
    '3. Replace missing/substituted fonts with system-safe alternatives (Arial, Meiryo, Noto Sans)',
    '4. Fix obvious layout issues: unreadably small text, overcrowded slides, excessive title length, poor spacing, misaligned cards/tables',
    '',
    'Prefer small targeted changes over a total rewrite unless the script is structurally broken.',
    '',
    '## Hard constraints (same as initial generation)',
    '',
    '- Write a complete Node.js script using "pptxgenjs".',
    '- Use `const pptxgen = require("pptxgenjs");` to import.',
    '- Import helpers: `const { safeOuterShadow } = require("./helpers/pptxgenjs_helpers/util");`',
    '- Import layout helpers: `const { warnIfSlideHasOverlaps, warnIfSlideElementsOutOfBounds } = require("./helpers/pptxgenjs_helpers/layout");`',
    '- Save output exactly as `deck.pptx`: `await pptx.writeFile({ fileName: "deck.pptx" });`',
    '- Wrap in async main() with `.catch(err => { console.error(err); process.exit(1); });`',
    '- Keep the deck editable. Do not rasterize text into images.',
    '- Do not use network access (no fetch, http, https).',
    '- Do not use child_process, exec, spawn.',
    '- Do not use destructive file operations (fs.rm, fs.unlink, fs.rmdir).',
    '- Do not import modules other than pptxgenjs and the helpers.',
    `- ${langInstruction}`,
    '',
    'Return the COMPLETE revised file, not a patch or diff.',
  );

  return parts.join('\n');
}
