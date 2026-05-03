/**
 * General utility functions for PptxGenJS helpers.
 */

/**
 * Convert inches to EMU (English Metric Units).
 * PptxGenJS uses inches but some advanced operations need EMU.
 *
 * @param {number} inches
 * @returns {number}
 */
function inchesToEmu(inches) {
  return Math.round(inches * 914400);
}

/**
 * Convert EMU to inches.
 *
 * @param {number} emu
 * @returns {number}
 */
function emuToInches(emu) {
  return emu / 914400;
}

/**
 * Normalize a color string to 6-digit hex without '#'.
 *
 * @param {string} color - e.g. "#FF0000", "FF0000", "red"
 * @returns {string} 6-digit hex string
 */
function hexColor(color) {
  if (!color) return '000000';
  const stripped = color.replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(stripped)) return stripped.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(stripped)) {
    return (
      stripped[0] +
      stripped[0] +
      stripped[1] +
      stripped[1] +
      stripped[2] +
      stripped[2]
    ).toUpperCase();
  }
  // Named colors - basic subset
  const named = {
    white: 'FFFFFF',
    black: '000000',
    red: 'FF0000',
    green: '00FF00',
    blue: '0000FF',
    gray: '808080',
    grey: '808080',
  };
  return named[color.toLowerCase()] || '000000';
}

/**
 * Clamp a number between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = { inchesToEmu, emuToInches, hexColor, clamp };
