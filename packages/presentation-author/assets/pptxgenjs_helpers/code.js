/**
 * Code block helpers for PptxGenJS.
 * Assists with rendering code snippets as styled text boxes.
 */

/**
 * Format code for PptxGenJS text box with monospace styling defaults.
 *
 * @param {string} code - Source code string
 * @param {object} opts - { fontSize, fontFace, bgColor, color, maxLines }
 * @returns {{ text: string, options: object }}
 */
function codeBlock(code, opts = {}) {
  const fontSize = opts.fontSize || 12;
  const fontFace = opts.fontFace || 'Courier New';
  const bgColor = opts.bgColor || 'F5F5F5';
  const color = opts.color || '1E1E1E';
  const maxLines = opts.maxLines || 20;

  let lines = code.split('\n');
  let truncated = false;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines.push('...');
    truncated = true;
  }

  return {
    text: lines.join('\n'),
    options: {
      fontFace,
      fontSize,
      color,
      fill: { color: bgColor },
      valign: 'top',
      isTextBox: true,
      paraSpaceBefore: 2,
      paraSpaceAfter: 2,
    },
    truncated,
    lineCount: lines.length,
  };
}

module.exports = { codeBlock };
