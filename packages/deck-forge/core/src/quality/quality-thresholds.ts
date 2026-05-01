/**
 * Quality-specific thresholds for visual readability.
 *
 * These are intentionally separate from the export-safety validation
 * constants in `src/validation/rules/content.ts`. Export validation ensures
 * a file can be rendered at all; quality thresholds capture what "looks
 * comfortable" on a slide.
 */

/** Tables wider than this are hard to parse visually. */
export const QUALITY_MAX_COMFORTABLE_TABLE_COLUMNS = 6;

/** Tables taller than this overwhelm a single slide. */
export const QUALITY_MAX_COMFORTABLE_TABLE_ROWS = 8;

/** Total cell count above which a table feels dense. */
export const QUALITY_MAX_COMFORTABLE_TABLE_CELLS = 30;

/** Element count per slide above which the layout feels cluttered. */
export const QUALITY_MAX_COMFORTABLE_ELEMENT_COUNT = 10;

/** Minimum element-area-to-slide-area ratio before "low utilization" fires. */
export const QUALITY_MIN_UTILIZATION_RATIO = 0.15;

/** Maximum occupied-area ratio before the slide feels crowded. */
export const QUALITY_MAX_UTILIZATION_RATIO = 0.85;

/** An element whose area is below this fraction of the slide is "tiny". */
export const QUALITY_TINY_FRAME_RATIO = 0.02;

/** Alignment tolerance in pixels when clustering element edges. */
export const QUALITY_ALIGNMENT_TOLERANCE_PX = 6;

/** Slides below this score are considered "weak". */
export const QUALITY_WEAK_SLIDE_THRESHOLD = 0.5;
