/**
 * Text sizing and measurement helpers for PptxGenJS.
 */

/**
 * Estimate the bounding box needed for a text string at a given font size.
 * Returns { w, h } in inches.
 *
 * @param {string} text - The text content
 * @param {object} opts - { fontSize, fontFace, bold, maxWidth }
 * @returns {{ w: number, h: number, lines: number }}
 */
function calcTextBox(text, opts = {}) {
  const fontSize = opts.fontSize || 18;
  const maxWidth = opts.maxWidth || 10;
  const bold = opts.bold || false;

  // Approximate character width in inches at given font size
  const charWidthFactor = bold ? 0.065 : 0.06;
  const charWidth = (fontSize / 18) * charWidthFactor;
  const lineHeight = (fontSize / 72) * 1.4; // 1.4x line spacing

  const charsPerLine = Math.floor(maxWidth / charWidth);
  const lines = Math.ceil(text.length / Math.max(charsPerLine, 1));
  const w = Math.min(text.length * charWidth, maxWidth);
  const h = lines * lineHeight;

  return { w, h, lines };
}

/**
 * Compute the largest font size that fits text within given dimensions.
 *
 * @param {string} text - The text content
 * @param {object} opts - { maxWidth, maxHeight, fontFace, bold, minSize, maxSize }
 * @returns {number} Optimal font size in points
 */
function autoFontSize(text, opts = {}) {
  const maxWidth = opts.maxWidth || 10;
  const maxHeight = opts.maxHeight || 5;
  const minSize = opts.minSize || 10;
  const maxSize = opts.maxSize || 44;
  const bold = opts.bold || false;

  let bestSize = minSize;

  for (let size = maxSize; size >= minSize; size -= 1) {
    const box = calcTextBox(text, { fontSize: size, maxWidth, bold });
    if (box.h <= maxHeight) {
      bestSize = size;
      break;
    }
  }

  return bestSize;
}

/**
 * Estimate number of lines for text at a given width and font size.
 *
 * @param {string} text
 * @param {object} opts - { fontSize, maxWidth, bold }
 * @returns {number}
 */
function estimateTextLines(text, opts = {}) {
  const box = calcTextBox(text, opts);
  return box.lines;
}

/**
 * Truncate text to fit within a given number of lines, appending ellipsis.
 *
 * @param {string} text
 * @param {object} opts - { fontSize, maxWidth, maxLines, bold }
 * @returns {string}
 */
function truncateText(text, opts = {}) {
  const fontSize = opts.fontSize || 18;
  const maxWidth = opts.maxWidth || 10;
  const maxLines = opts.maxLines || 3;
  const bold = opts.bold || false;

  const charWidthFactor = bold ? 0.065 : 0.06;
  const charWidth = (fontSize / 18) * charWidthFactor;
  const charsPerLine = Math.floor(maxWidth / charWidth);
  const maxChars = charsPerLine * maxLines;

  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3).trimEnd() + '...';
}

module.exports = { calcTextBox, autoFontSize, estimateTextLines, truncateText };
