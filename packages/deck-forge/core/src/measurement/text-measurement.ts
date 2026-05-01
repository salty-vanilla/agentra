/**
 * Conservative text measurement utilities for overflow detection.
 *
 * These are heuristic-based estimates, not exact PowerPoint measurements.
 * False positives (overestimating) are preferred over missed clipping.
 */

/** CJK Unicode ranges used for Japanese text detection. */
const CJK_REGEX =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/g;

/**
 * Infer the dominant language of a text string based on CJK character ratio.
 * Returns `"ja"` when ≥ 20% of characters are CJK, otherwise `"en"`.
 */
export function inferTextLanguage(text: string): "ja" | "en" {
  if (text.length === 0) return "en";
  const cjkMatches = text.match(CJK_REGEX);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  return cjkCount / text.length >= 0.2 ? "ja" : "en";
}

/** Approximate character width multiplier relative to fontSize. */
const CHAR_WIDTH_FACTOR = { ja: 0.95, en: 0.52 } as const;

/**
 * Estimate the number of visual lines a text string will occupy
 * at a given width and font size.
 *
 * - Respects explicit newlines (`\n`).
 * - Empty text returns 0.
 */
export function estimateTextLines(input: {
  text: string;
  width: number;
  fontSize: number;
  language?: "ja" | "en";
}): number {
  const { text, width, fontSize } = input;
  if (text.length === 0) return 0;
  if (width <= 0 || fontSize <= 0) return 0;

  const lang = input.language ?? inferTextLanguage(text);
  const charWidth = fontSize * CHAR_WIDTH_FACTOR[lang];
  const charsPerLine = Math.max(1, Math.floor(width / charWidth));

  const paragraphs = text.split("\n");
  let totalLines = 0;
  for (const para of paragraphs) {
    if (para.length === 0) {
      totalLines += 1; // empty line still occupies a line
    } else {
      totalLines += Math.ceil(para.length / charsPerLine);
    }
  }
  return totalLines;
}

/**
 * Estimate the pixel height of a text box given its content and constraints.
 *
 * - Uses `estimateTextLines` internally.
 * - Default lineHeight multiplier is 1.4 (conservative for presentation text).
 * - Empty text returns 0.
 */
export function estimateTextBoxHeight(input: {
  text: string;
  width: number;
  fontSize: number;
  lineHeight?: number;
  language?: "ja" | "en";
  maxCharsPerLineOverride?: number;
}): number {
  const { text, width, fontSize } = input;
  if (text.length === 0) return 0;

  const lineHeightMultiplier = input.lineHeight ?? 1.4;

  let lines: number;
  if (input.maxCharsPerLineOverride != null && input.maxCharsPerLineOverride > 0) {
    // Use explicit chars-per-line override instead of width-based calculation
    const charsPerLine = input.maxCharsPerLineOverride;
    const paragraphs = text.split("\n");
    lines = 0;
    for (const para of paragraphs) {
      if (para.length === 0) {
        lines += 1;
      } else {
        lines += Math.ceil(para.length / charsPerLine);
      }
    }
  } else {
    lines = estimateTextLines({
      text,
      width,
      fontSize,
      language: input.language,
    });
  }

  return lines * fontSize * lineHeightMultiplier;
}
