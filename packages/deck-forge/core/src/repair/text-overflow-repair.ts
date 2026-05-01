/**
 * Phase 5B: Text and table overflow repair.
 *
 * Reduces font sizes to mitigate overflow risk detected by content-density
 * validation. Does not rewrite text, split slides, or use LLM summarization.
 */
import type {
  PresentationIR,
  TableElementIR,
  TextElementIR,
  ValidationIssue,
} from "#src/index.js";
import { estimateTextBoxHeight } from "#src/measurement/text-measurement.js";
import { richTextToPlainText } from "#src/measurement/rich-text-utils.js";
import { estimateTableHeight } from "#src/measurement/table-measurement.js";
import { clonePresentation } from "#src/operations/utils.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextOverflowRepairAction = {
  elementId: string;
  slideId: string;
  action: "reduce_font_size" | "reduce_table_font_size";
  from: number;
  to: number;
  issueId: string;
};

export type TextOverflowRepairResult = {
  presentation: PresentationIR;
  proposed: TextOverflowRepairAction[];
  applied: TextOverflowRepairAction[];
  skipped: TextOverflowRepairAction[];
  issuesBefore: ValidationIssue[];
  issuesAfter: ValidationIssue[];
  summary: {
    proposedCount: number;
    appliedCount: number;
    skippedCount: number;
    issueCountBefore: number;
    issueCountAfter: number;
  };
};

export type TextOverflowRepairOptions = {
  minFontSize?: number;
  dryRun?: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEXT_OVERFLOW_PREFIX = "content/text-overflow-risk/";
const TABLE_CLIPPED_PREFIX = "content/table-clipped/";

const MIN_FONT_SIZE_TITLE = 18;
const MIN_FONT_SIZE_BODY = 10;
const DEFAULT_MIN_TABLE_FONT_SIZE = 8;
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_TABLE_FONT_SIZE = 14;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function repairTextOverflow(input: {
  presentation: PresentationIR;
  issues?: ValidationIssue[];
  options?: TextOverflowRepairOptions;
}): Promise<TextOverflowRepairResult> {
  const { presentation, options } = input;
  const dryRun = options?.dryRun ?? false;

  const cloned = clonePresentation(presentation);

  // Obtain content-density issues.
  let issuesBefore: ValidationIssue[];
  if (input.issues) {
    issuesBefore = filterOverflowIssues(input.issues);
  } else {
    const report = await validatePresentation(cloned);
    issuesBefore = filterOverflowIssues(report.issues);
  }

  const proposed: TextOverflowRepairAction[] = [];
  const applied: TextOverflowRepairAction[] = [];
  const skipped: TextOverflowRepairAction[] = [];

  for (const issue of issuesBefore) {
    if (issue.id.startsWith(TEXT_OVERFLOW_PREFIX)) {
      const segments = issue.id.slice(TEXT_OVERFLOW_PREFIX.length).split("/");
      const slideId = segments[0];
      const elementId = segments[1];
      if (!slideId || !elementId) continue;

      const slide = cloned.slides.find((s) => s.id === slideId);
      const element = slide?.elements.find((e) => e.id === elementId);
      if (!element || element.type !== "text") continue;

      const action = computeTextRepair(element, issue.id, slideId, options);
      if (!action) continue;

      proposed.push(action);
      if (dryRun) continue;

      // Apply: reduce font size
      element.style = { ...element.style, fontSize: action.to };
      applied.push(action);
    } else if (issue.id.startsWith(TABLE_CLIPPED_PREFIX)) {
      const segments = issue.id.slice(TABLE_CLIPPED_PREFIX.length).split("/");
      const slideId = segments[0];
      const elementId = segments[1];
      if (!slideId || !elementId) continue;

      const slide = cloned.slides.find((s) => s.id === slideId);
      const element = slide?.elements.find((e) => e.id === elementId);
      if (!element || element.type !== "table") continue;

      const action = computeTableRepair(element, issue.id, slideId, options);
      if (!action) continue;

      proposed.push(action);
      if (dryRun) continue;

      // Apply: reduce table font size, preserving other style fields
      element.style = {
        ...element.style,
        textStyle: {
          ...element.style?.textStyle,
          fontSize: action.to,
        },
      };
      applied.push(action);
    }
  }

  // Re-validate to get issues after repair.
  const reportAfter = await validatePresentation(cloned);
  const issuesAfter = filterOverflowIssues(reportAfter.issues);

  return {
    presentation: cloned,
    proposed,
    applied,
    skipped,
    issuesBefore,
    issuesAfter,
    summary: {
      proposedCount: proposed.length,
      appliedCount: applied.length,
      skippedCount: skipped.length,
      issueCountBefore: issuesBefore.length,
      issueCountAfter: issuesAfter.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterOverflowIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter(
    (i) =>
      i.id.startsWith(TEXT_OVERFLOW_PREFIX) ||
      i.id.startsWith(TABLE_CLIPPED_PREFIX),
  );
}

function computeTextRepair(
  element: TextElementIR,
  issueId: string,
  slideId: string,
  options?: TextOverflowRepairOptions,
): TextOverflowRepairAction | undefined {
  const currentSize = element.style.fontSize ?? DEFAULT_FONT_SIZE;
  const minSize =
    options?.minFontSize ??
    (element.role === "title" ? MIN_FONT_SIZE_TITLE : MIN_FONT_SIZE_BODY);

  if (currentSize <= minSize) return undefined;

  const plainText = richTextToPlainText(element.text);
  if (plainText.length === 0) return undefined;

  const estimatedHeight = estimateTextBoxHeight({
    text: plainText,
    width: element.frame.width,
    fontSize: currentSize,
    lineHeight: element.style.lineHeight,
  });

  const frameHeight = element.frame.height;
  if (frameHeight <= 0 || estimatedHeight <= frameHeight) return undefined;

  // Ratio-based reduction: scale font size so estimated height fits frame.
  const ratio = frameHeight / estimatedHeight;
  const targetSize = Math.max(minSize, Math.floor(currentSize * ratio));

  if (targetSize >= currentSize) return undefined;

  return {
    elementId: element.id,
    slideId,
    action: "reduce_font_size",
    from: currentSize,
    to: targetSize,
    issueId,
  };
}

function computeTableRepair(
  element: TableElementIR,
  issueId: string,
  slideId: string,
  options?: TextOverflowRepairOptions,
): TextOverflowRepairAction | undefined {
  const currentSize = element.style?.textStyle?.fontSize ?? DEFAULT_TABLE_FONT_SIZE;
  const minSize = options?.minFontSize ?? DEFAULT_MIN_TABLE_FONT_SIZE;

  if (currentSize <= minSize) return undefined;

  const bodyRowCount = element.rows.length;
  const estimatedHeight = estimateTableHeight({
    rowCount: bodyRowCount,
    headerRows: 1,
    fontSize: currentSize,
  });

  const frameHeight = element.frame.height;
  if (frameHeight <= 0 || estimatedHeight <= frameHeight) return undefined;

  // Ratio-based reduction.
  const ratio = frameHeight / estimatedHeight;
  const targetSize = Math.max(minSize, Math.floor(currentSize * ratio));

  if (targetSize >= currentSize) return undefined;

  return {
    elementId: element.id,
    slideId,
    action: "reduce_table_font_size",
    from: currentSize,
    to: targetSize,
    issueId,
  };
}
