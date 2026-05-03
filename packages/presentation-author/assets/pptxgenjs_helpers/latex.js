/**
 * LaTeX/math helpers for PptxGenJS.
 * Converts simple math expressions to SVG data URIs for embedding.
 */

/**
 * Wrap a math expression in a minimal SVG text element.
 * For production use, integrate MathJax or KaTeX server-side rendering.
 *
 * @param {string} expression - Math expression (plain text or simple LaTeX)
 * @param {object} opts - { fontSize, color }
 * @returns {string} SVG data URI
 */
function mathToSvgDataUri(expression, opts = {}) {
  const fontSize = opts.fontSize || 24;
  const color = opts.color || '#000000';
  const width = Math.max(expression.length * fontSize * 0.6, 100);
  const height = fontSize * 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="10" y="${fontSize * 1.2}" font-size="${fontSize}" font-family="serif" fill="${color}">${escapeXml(expression)}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { mathToSvgDataUri, escapeXml };
