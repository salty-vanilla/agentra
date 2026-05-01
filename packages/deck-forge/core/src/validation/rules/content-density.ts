/**
 * Content-density validation rules.
 *
 * Emits deterministic issues for text/table overflow risk.
 * Does NOT modify the presentation.
 */
import type { PresentationIR, TableElementIR, TextElementIR, ValidationIssue } from "#src/index.js";
import {
  estimateTextBoxHeight,
  inferTextLanguage,
  richTextToPlainText,
} from "#src/measurement/index.js";
import { estimateTableHeight } from "#src/measurement/table-measurement.js";
import type { IssueFactory, ValidateLevel } from "#src/validation/types.js";

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_TABLE_FONT_SIZE = 14;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Warning when estimated height exceeds frame height by this factor. */
const OVERFLOW_WARNING_FACTOR = 1.05;
/** Error when estimated height exceeds frame height by this factor. */
const OVERFLOW_ERROR_FACTOR = 1.35;

const TITLE_MAX_CHARS_JA = 25;
const TITLE_MAX_CHARS_EN = 60;
const CALLOUT_MAX_CHARS_JA = 45;
const CALLOUT_MAX_CHARS_EN = 90;
const MAX_BULLET_PARAGRAPHS = 5;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function validateContentDensity(
  presentation: PresentationIR,
  factory: IssueFactory,
  _options: { level?: ValidateLevel } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const slide of presentation.slides) {
    for (const element of slide.elements) {
      if (element.type === "text") {
        checkTextOverflowRisk(element, slide.id, factory, issues);
        checkTitleTooLong(element, slide.id, factory, issues);
        checkBulletListTooDense(element, slide.id, factory, issues);
        checkCalloutTooDense(element, slide.id, factory, issues);
      } else if (element.type === "table") {
        checkTableClipped(element, slide.id, factory, issues);
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Text overflow risk
// ---------------------------------------------------------------------------

function checkTextOverflowRisk(
  element: TextElementIR,
  slideId: string,
  factory: IssueFactory,
  issues: ValidationIssue[],
): void {
  const fontSize = element.style.fontSize ?? DEFAULT_FONT_SIZE;
  const plainText = richTextToPlainText(element.text);
  if (plainText.length === 0) return;

  const estimatedHeight = estimateTextBoxHeight({
    text: plainText,
    width: element.frame.width,
    fontSize,
    lineHeight: element.style.lineHeight,
  });

  const frameHeight = element.frame.height;
  if (frameHeight <= 0) return;

  const ratio = estimatedHeight / frameHeight;

  if (ratio > OVERFLOW_ERROR_FACTOR) {
    const issue = factory.issue(
      "error",
      "content",
      `Text is likely to overflow element frame (estimated ${Math.round(estimatedHeight)}px vs ${Math.round(frameHeight)}px): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/text-overflow-risk/${slideId}/${element.id}`;
    issue.autoFixable = true;
    issue.suggestedFix = {
      type: "reduce_font_size",
      target: element.id,
      params: { fontSize: computeReducedFontSize(fontSize, ratio, element.role) },
    };
    issues.push(issue);
  } else if (ratio > OVERFLOW_WARNING_FACTOR) {
    const issue = factory.issue(
      "warning",
      "content",
      `Text may overflow element frame (estimated ${Math.round(estimatedHeight)}px vs ${Math.round(frameHeight)}px): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/text-overflow-risk/${slideId}/${element.id}`;
    issue.autoFixable = true;
    issue.suggestedFix = {
      type: "reduce_font_size",
      target: element.id,
      params: { fontSize: computeReducedFontSize(fontSize, ratio, element.role) },
    };
    issues.push(issue);
  }
}

function computeReducedFontSize(
  currentSize: number,
  overflowRatio: number,
  role: TextElementIR["role"],
): number {
  const minSize = role === "title" ? 18 : 10;
  // Scale down by overflow ratio to fit within frame
  const targetSize = Math.floor(currentSize / overflowRatio);
  return Math.max(minSize, targetSize);
}

// ---------------------------------------------------------------------------
// Title too long
// ---------------------------------------------------------------------------

function checkTitleTooLong(
  element: TextElementIR,
  slideId: string,
  factory: IssueFactory,
  issues: ValidationIssue[],
): void {
  if (element.role !== "title") return;

  const plainText = richTextToPlainText(element.text);
  if (plainText.length === 0) return;

  const lang = inferTextLanguage(plainText);
  const maxChars = lang === "ja" ? TITLE_MAX_CHARS_JA : TITLE_MAX_CHARS_EN;

  if (plainText.length > maxChars) {
    const issue = factory.issue(
      "warning",
      "content",
      `Title is too long (${plainText.length} chars, max ${maxChars} for ${lang}): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/title-too-long/${slideId}/${element.id}`;
    issues.push(issue);
  }
}

// ---------------------------------------------------------------------------
// Bullet list too dense
// ---------------------------------------------------------------------------

function checkBulletListTooDense(
  element: TextElementIR,
  slideId: string,
  factory: IssueFactory,
  issues: ValidationIssue[],
): void {
  const bulletParagraphs = element.text.paragraphs.filter((p) => p.bullet != null);
  if (bulletParagraphs.length <= MAX_BULLET_PARAGRAPHS) return;

  const issue = factory.issue(
    "warning",
    "content",
    `Bullet list has ${bulletParagraphs.length} items (max ${MAX_BULLET_PARAGRAPHS} recommended): ${element.id}`,
    `element/${element.id}`,
  );
  issue.id = `content/bullet-list-too-dense/${slideId}/${element.id}`;
  issues.push(issue);
}

// ---------------------------------------------------------------------------
// Callout too dense
// ---------------------------------------------------------------------------

function checkCalloutTooDense(
  element: TextElementIR,
  slideId: string,
  factory: IssueFactory,
  issues: ValidationIssue[],
): void {
  if (element.role !== "callout") return;

  const plainText = richTextToPlainText(element.text);
  if (plainText.length === 0) return;

  const lang = inferTextLanguage(plainText);
  const maxChars = lang === "ja" ? CALLOUT_MAX_CHARS_JA : CALLOUT_MAX_CHARS_EN;

  if (plainText.length > maxChars) {
    const issue = factory.issue(
      "warning",
      "content",
      `Callout is too dense (${plainText.length} chars, max ${maxChars} for ${lang}): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/callout-too-dense/${slideId}/${element.id}`;
    issues.push(issue);
  }
}

// ---------------------------------------------------------------------------
// Table clipped
// ---------------------------------------------------------------------------

function checkTableClipped(
  element: TableElementIR,
  slideId: string,
  factory: IssueFactory,
  issues: ValidationIssue[],
): void {
  const fontSize = element.style?.textStyle?.fontSize ?? DEFAULT_TABLE_FONT_SIZE;
  const bodyRowCount = element.rows.length;

  const estimatedHeight = estimateTableHeight({
    rowCount: bodyRowCount,
    headerRows: 1,
    fontSize,
  });

  const frameHeight = element.frame.height;
  if (frameHeight <= 0) return;

  const ratio = estimatedHeight / frameHeight;

  if (ratio > OVERFLOW_ERROR_FACTOR) {
    const issue = factory.issue(
      "error",
      "content",
      `Table is likely clipped (estimated ${Math.round(estimatedHeight)}px vs ${Math.round(frameHeight)}px): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/table-clipped/${slideId}/${element.id}`;
    issues.push(issue);
  } else if (ratio > OVERFLOW_WARNING_FACTOR) {
    const issue = factory.issue(
      "warning",
      "content",
      `Table may be clipped (estimated ${Math.round(estimatedHeight)}px vs ${Math.round(frameHeight)}px): ${element.id}`,
      `element/${element.id}`,
    );
    issue.id = `content/table-clipped/${slideId}/${element.id}`;
    issues.push(issue);
  }
}
