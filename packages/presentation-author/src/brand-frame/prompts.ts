import type { BrandFrame } from './types.js';

export function buildBrandFramePromptSection(brandFrame: BrandFrame): string {
  const parts: string[] = [
    'Company Brand Frame:',
    '',
    `Slide size:`,
    `- width: ${brandFrame.slideSize.width}in`,
    `- height: ${brandFrame.slideSize.height}in`,
  ];

  if (brandFrame.header) {
    parts.push(
      '',
      'Header bar (dark-blue-to-teal gradient band at top of slide):',
      `- x=${brandFrame.header.x}, y=${brandFrame.header.y}, w=${brandFrame.header.width}, h=${brandFrame.header.height}`,
      '- The slide TITLE must be rendered as WHITE bold text directly on top of the header bar.',
      '- Title text position: x=0.5, y=0, w=' +
        (brandFrame.header.width - 1.0) +
        ', h=' +
        brandFrame.header.height +
        ', color="FFFFFF", bold=true, fontSize=22-26.',
      '- Add the title text AFTER calling applyBrandFrame() so it appears on top of the header image.',
    );
  }

  if (brandFrame.footer) {
    parts.push(
      '',
      'Footer bar (white bar with company logo on the right):',
      `- x=${brandFrame.footer.x}, y=${brandFrame.footer.y}, w=${brandFrame.footer.width}, h=${brandFrame.footer.height}`,
      '- Decorative only. Do not place text on the footer.',
    );
  }

  const safeBottom = brandFrame.safeArea.y + brandFrame.safeArea.height;
  const safeRight = brandFrame.safeArea.x + brandFrame.safeArea.width;

  parts.push(
    '',
    'Safe content area (body content MUST stay inside this rectangle):',
    `- x=${brandFrame.safeArea.x}, y=${brandFrame.safeArea.y}, w=${brandFrame.safeArea.width}, h=${brandFrame.safeArea.height}`,
    `- Boundaries: left=${brandFrame.safeArea.x}in, top=${brandFrame.safeArea.y}in, right=${safeRight.toFixed(2)}in, bottom=${safeBottom.toFixed(2)}in`,
    '- The title goes on the header bar (above the safe area), NOT inside the safe area.',
    '- All body content (text, charts, tables, cards) must fit within the safe area.',
    '',
    'Import and usage:',
    '- `const { applyBrandFrame, getSafeArea, getHeaderArea } = require("./helpers/brand-frame");`',
    '- `const safe = getSafeArea();`',
    '',
    'Per-slide rules:',
    '- **Title/cover slides**: Skip header and footer entirely:',
    '    `applyBrandFrame(slide, { header: false, footer: false });`',
    '    Use the full slide area for a visually impactful title design.',
    '- **Section divider slides**: Skip the header (use custom styling):',
    '    `applyBrandFrame(slide, { header: false });`',
    '- **Normal content slides**: Apply both header and footer with page number:',
    '    `applyBrandFrame(slide, { pageNumber: slideIndex });`',
    '    where slideIndex is the 1-based slide number (e.g. 1, 2, 3...).',
    '    Then add the title as white text on the header bar.',
    '',
    'Background color:',
    '- CRITICAL: To set a slide background color, use `slide.background = { color: "F1F8E9" };`',
    '- NEVER add a full-slide rectangle (x=0, y=0, w=13.33, h=7.50) as a background.',
    '  Full-slide rectangles will cover the header/footer images and hide them.',
    '',
    'Z-order (drawing order):',
    '- Call `applyBrandFrame(slide, ...)` as the FIRST drawing operation on each slide.',
    '- Then add the title text on the header bar.',
    '- Then add body content. This ensures header/footer images are never covered.',
    '',
    'Layout constraints:',
    '- CRITICAL: Every body element must satisfy: element.y + element.h <= ' +
      safeBottom.toFixed(2),
    '- CRITICAL: Every body element must satisfy: element.x + element.w <= ' +
      safeRight.toFixed(2),
    '- When stacking sections vertically, compute remaining height: remainingH = ' +
      safeBottom.toFixed(2) +
      ' - currentY.',
    '- If content does not fit, reduce text, shrink elements, or split into multiple slides.',
  );

  if (brandFrame.guidance?.length) {
    parts.push('');
    for (const g of brandFrame.guidance) {
      parts.push(`- ${g}`);
    }
  }

  return parts.join('\n');
}
