/**
 * Image sizing helpers for PptxGenJS.
 */

/**
 * Compute sizing options to crop an image to fill a target area.
 * Returns PptxGenJS-compatible sizing object.
 *
 * @param {object} opts - { targetW, targetH, imageW, imageH }
 * @returns {{ type: string, w: number, h: number }}
 */
function imageSizingCrop(opts = {}) {
  const { targetW = 5, targetH = 3, imageW = 1, imageH = 1 } = opts;
  const targetRatio = targetW / targetH;
  const imageRatio = imageW / imageH;

  let cropW, cropH;
  if (imageRatio > targetRatio) {
    // Image wider than target — crop sides
    cropH = imageH;
    cropW = imageH * targetRatio;
  } else {
    // Image taller than target — crop top/bottom
    cropW = imageW;
    cropH = imageW / targetRatio;
  }

  return {
    type: 'crop',
    w: targetW,
    h: targetH,
  };
}

/**
 * Compute sizing options to contain an image within a target area (letterbox).
 * Returns PptxGenJS-compatible sizing object.
 *
 * @param {object} opts - { targetW, targetH, imageW, imageH }
 * @returns {{ type: string, w: number, h: number }}
 */
function imageSizingContain(opts = {}) {
  const { targetW = 5, targetH = 3, imageW = 1, imageH = 1 } = opts;
  const targetRatio = targetW / targetH;
  const imageRatio = imageW / imageH;

  let w, h;
  if (imageRatio > targetRatio) {
    // Image wider — fit to width
    w = targetW;
    h = targetW / imageRatio;
  } else {
    // Image taller — fit to height
    h = targetH;
    w = targetH * imageRatio;
  }

  return {
    type: 'contain',
    w,
    h,
  };
}

/**
 * Compute sizing options to cover a target area (no letterbox, may overflow).
 * Returns PptxGenJS-compatible sizing object.
 *
 * @param {object} opts - { targetW, targetH, imageW, imageH }
 * @returns {{ type: string, w: number, h: number }}
 */
function imageSizingCover(opts = {}) {
  const { targetW = 5, targetH = 3, imageW = 1, imageH = 1 } = opts;
  const targetRatio = targetW / targetH;
  const imageRatio = imageW / imageH;

  let w, h;
  if (imageRatio > targetRatio) {
    h = targetH;
    w = targetH * imageRatio;
  } else {
    w = targetW;
    h = targetW / imageRatio;
  }

  return {
    type: 'cover',
    w,
    h,
  };
}

/**
 * Convert a Buffer or base64 string to a data URI suitable for PptxGenJS.
 *
 * @param {Buffer|string} data - Image data (Buffer or base64 string)
 * @param {string} mimeType - e.g. "image/png", "image/jpeg"
 * @returns {string}
 */
function imageDataUri(data, mimeType = 'image/png') {
  const base64 = typeof data === 'string' ? data : data.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

module.exports = { imageSizingCrop, imageSizingContain, imageSizingCover, imageDataUri };
