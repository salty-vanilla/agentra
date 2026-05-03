/**
 * Layout builder helpers for PptxGenJS.
 * Provides standard multi-column and grid layout coordinates.
 */

const { SLIDE_WIDTH, SLIDE_HEIGHT } = require('./layout');

const MARGIN = 0.5;
const GUTTER = 0.3;
const HEADER_HEIGHT = 1.2;

/**
 * Compute two-column layout regions.
 *
 * @param {object} opts - { margin, gutter, headerHeight, equalWidth }
 * @returns {{ left: { x, y, w, h }, right: { x, y, w, h } }}
 */
function twoColumnLayout(opts = {}) {
  const margin = opts.margin ?? MARGIN;
  const gutter = opts.gutter ?? GUTTER;
  const headerH = opts.headerHeight ?? HEADER_HEIGHT;

  const contentW = SLIDE_WIDTH - 2 * margin;
  const contentH = SLIDE_HEIGHT - headerH - margin;
  const colW = (contentW - gutter) / 2;
  const y = headerH;

  return {
    left: { x: margin, y, w: colW, h: contentH },
    right: { x: margin + colW + gutter, y, w: colW, h: contentH },
  };
}

/**
 * Compute three-column layout regions.
 *
 * @param {object} opts - { margin, gutter, headerHeight }
 * @returns {{ cols: Array<{ x, y, w, h }> }}
 */
function threeColumnLayout(opts = {}) {
  const margin = opts.margin ?? MARGIN;
  const gutter = opts.gutter ?? GUTTER;
  const headerH = opts.headerHeight ?? HEADER_HEIGHT;

  const contentW = SLIDE_WIDTH - 2 * margin;
  const contentH = SLIDE_HEIGHT - headerH - margin;
  const colW = (contentW - 2 * gutter) / 3;
  const y = headerH;

  const cols = [0, 1, 2].map((i) => ({
    x: margin + i * (colW + gutter),
    y,
    w: colW,
    h: contentH,
  }));

  return { cols };
}

/**
 * Compute a grid layout for N items.
 *
 * @param {number} itemCount
 * @param {object} opts - { margin, gutter, headerHeight, maxCols }
 * @returns {{ cells: Array<{ x, y, w, h }>, cols: number, rows: number }}
 */
function gridLayout(itemCount, opts = {}) {
  const margin = opts.margin ?? MARGIN;
  const gutter = opts.gutter ?? GUTTER;
  const headerH = opts.headerHeight ?? HEADER_HEIGHT;
  const maxCols = opts.maxCols ?? 3;

  const cols = Math.min(itemCount, maxCols);
  const rows = Math.ceil(itemCount / cols);

  const contentW = SLIDE_WIDTH - 2 * margin;
  const contentH = SLIDE_HEIGHT - headerH - margin;
  const cellW = (contentW - (cols - 1) * gutter) / cols;
  const cellH = (contentH - (rows - 1) * gutter) / rows;

  const cells = [];
  for (let i = 0; i < itemCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      x: margin + col * (cellW + gutter),
      y: headerH + row * (cellH + gutter),
      w: cellW,
      h: cellH,
    });
  }

  return { cells, cols, rows };
}

module.exports = { twoColumnLayout, threeColumnLayout, gridLayout };
