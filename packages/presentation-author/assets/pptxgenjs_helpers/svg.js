/**
 * SVG helpers for PptxGenJS.
 */

/**
 * Convert an SVG string to a data URI for embedding in PptxGenJS.
 *
 * @param {string} svgString - Raw SVG markup
 * @returns {string} data URI
 */
function svgToDataUri(svgString) {
  const encoded = Buffer.from(svgString, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

module.exports = { svgToDataUri };
