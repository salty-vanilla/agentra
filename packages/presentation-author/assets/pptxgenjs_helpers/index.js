/**
 * pptxgenjs_helpers — Utility functions for PptxGenJS authoring scripts.
 *
 * Inspired by the OpenAI slides skill helper pattern.
 * These helpers assist LLM-generated scripts with text sizing, image fitting,
 * layout validation, and common slide operations.
 */

const text = require('./text');
const image = require('./image');
const svg = require('./svg');
const layout = require('./layout');
const layoutBuilders = require('./layout_builders');
const util = require('./util');

module.exports = {
  // Text helpers
  calcTextBox: text.calcTextBox,
  autoFontSize: text.autoFontSize,
  estimateTextLines: text.estimateTextLines,
  truncateText: text.truncateText,

  // Image helpers
  imageSizingCrop: image.imageSizingCrop,
  imageSizingContain: image.imageSizingContain,
  imageSizingCover: image.imageSizingCover,
  imageDataUri: image.imageDataUri,

  // SVG helpers
  svgToDataUri: svg.svgToDataUri,

  // Layout validation
  warnIfSlideHasOverlaps: layout.warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds: layout.warnIfSlideElementsOutOfBounds,
  getSlideElements: layout.getSlideElements,

  // Layout builders
  twoColumnLayout: layoutBuilders.twoColumnLayout,
  threeColumnLayout: layoutBuilders.threeColumnLayout,
  gridLayout: layoutBuilders.gridLayout,

  // Utilities
  inchesToEmu: util.inchesToEmu,
  emuToInches: util.emuToInches,
  hexColor: util.hexColor,
  clamp: util.clamp,
};
