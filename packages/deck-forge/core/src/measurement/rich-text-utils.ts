/**
 * Helpers for extracting plain text from RichText structures.
 */
import type { RichText } from "#src/index.js";

/**
 * Convert RichText to a single plain-text string.
 * Paragraphs are joined with `\n`. Runs within a paragraph are concatenated.
 * Does not mutate input.
 */
export function richTextToPlainText(text: RichText): string {
  return richTextParagraphsToPlainText(text).join("\n");
}

/**
 * Convert RichText to an array of per-paragraph plain-text strings.
 * Each paragraph's runs are concatenated into a single string.
 * Does not mutate input.
 */
export function richTextParagraphsToPlainText(text: RichText): string[] {
  return text.paragraphs.map((paragraph) =>
    paragraph.runs.map((run) => run.text).join(""),
  );
}
