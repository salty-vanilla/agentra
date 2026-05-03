/**
 * Layout validation helpers for PptxGenJS.
 * Checks slide elements for overlaps and out-of-bounds positioning.
 */

// Standard LAYOUT_WIDE dimensions in inches
const SLIDE_WIDTH = 13.33;
const SLIDE_HEIGHT = 7.5;

/**
 * Extract element bounding boxes from a PptxGenJS slide object.
 * Note: PptxGenJS stores elements internally; this reads ._slideObjects.
 *
 * @param {object} slide - PptxGenJS slide instance
 * @returns {Array<{ x: number, y: number, w: number, h: number, type: string }>}
 */
function getSlideElements(slide) {
  if (!slide || !slide._slideObjects) return [];
  return slide._slideObjects.map((obj) => ({
    x: obj.options?.x ?? 0,
    y: obj.options?.y ?? 0,
    w: obj.options?.w ?? 0,
    h: obj.options?.h ?? 0,
    type: obj._type || 'unknown',
  }));
}

/**
 * Check if any two elements on a slide overlap.
 * Logs warnings to console. Returns array of overlap descriptions.
 *
 * @param {object} slide - PptxGenJS slide instance
 * @param {object} pptx - PptxGenJS presentation instance (for dimensions)
 * @returns {string[]} Overlap warning messages
 */
function warnIfSlideHasOverlaps(slide, pptx) {
  const elements = getSlideElements(slide);
  const warnings = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      if (rectsOverlap(a, b)) {
        const msg = `Overlap: element ${i} (${a.type}) and element ${j} (${b.type})`;
        warnings.push(msg);
        console.warn('[pptxgenjs_helpers]', msg);
      }
    }
  }

  return warnings;
}

/**
 * Check if any element extends beyond slide bounds.
 * Logs warnings to console. Returns array of out-of-bounds descriptions.
 *
 * @param {object} slide - PptxGenJS slide instance
 * @param {object} pptx - PptxGenJS presentation instance (for dimensions)
 * @returns {string[]} Out-of-bounds warning messages
 */
function warnIfSlideElementsOutOfBounds(slide, pptx) {
  const elements = getSlideElements(slide);
  const warnings = [];

  const slideW = pptx?.layout === 'LAYOUT_WIDE' ? SLIDE_WIDTH : 10;
  const slideH = SLIDE_HEIGHT;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const right = el.x + el.w;
    const bottom = el.y + el.h;

    if (el.x < 0 || el.y < 0 || right > slideW || bottom > slideH) {
      const msg = `Out of bounds: element ${i} (${el.type}) at [${el.x}, ${el.y}, ${el.w}, ${el.h}]`;
      warnings.push(msg);
      console.warn('[pptxgenjs_helpers]', msg);
    }
  }

  return warnings;
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

module.exports = {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
  getSlideElements,
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
};
