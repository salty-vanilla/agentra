import type { PresentationIR, ValidationIssue } from "#src/index.js";
import type { IssueFactory, ValidateLevel } from "#src/validation/types.js";

const EXPORT_MAX_TABLE_CELLS = 32;
const EXPORT_MIN_TABLE_ROW_HEIGHT = 28;
const EXPORT_MAX_CELL_CHARS = 24;
const EXPORT_MAX_CELL_DENSITY = 0.34;

export function validateContent(
  presentation: PresentationIR,
  factory: IssueFactory,
  options: { level?: ValidateLevel } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenTitles = new Map<string, string>();
  const isExport = options.level === "export";

  for (const slide of presentation.slides) {
    const textElements = slide.elements.filter((element) => element.type === "text");
    const normalizedTitle = (slide.title ?? "").trim().toLowerCase();

    if (normalizedTitle) {
      const existingSlideId = seenTitles.get(normalizedTitle);
      if (existingSlideId) {
        issues.push(
          factory.issue(
            "warning",
            "content",
            `Duplicate slide title: ${slide.title}`,
            `slide/${slide.id}`,
          ),
        );
      } else {
        seenTitles.set(normalizedTitle, slide.id);
      }
    }

    if (textElements.length === 0 && slide.elements.length === 0) {
      issues.push(
        factory.issue("error", "content", `Slide has no content: ${slide.id}`, `slide/${slide.id}`),
      );
    } else if (totalTextLength(textElements) < 12 && slide.elements.length <= 1) {
      issues.push(
        factory.issue(
          "warning",
          "content",
          `Slide appears near-empty: ${slide.id}`,
          `slide/${slide.id}`,
        ),
      );
    }

    if (textElements.length > 6) {
      issues.push(
        factory.issue(
          "warning",
          "content",
          `Slide has too many text blocks: ${slide.id}`,
          `slide/${slide.id}`,
        ),
      );
    }

    for (const element of textElements) {
      const textLength = flattenText(element).length;

      if (textLength > 600) {
        issues.push(
          factory.issue(
            "warning",
            "content",
            `Text is too long in element: ${element.id}`,
            `element/${element.id}`,
          ),
        );
      }
    }

    for (const element of slide.elements) {
      if (element.type !== "table") {
        continue;
      }

      const cellCount = element.headers.length * (element.rows.length + 1);
      if (cellCount > 40) {
        issues.push(
          factory.issue(
            "warning",
            "content",
            `Table has too many cells for one slide: ${element.id}`,
            `element/${element.id}`,
          ),
        );
      }

      if (isExport && cellCount > EXPORT_MAX_TABLE_CELLS) {
        issues.push(
          factory.issue(
            "warning",
            "content",
            `Table is dense for PPTX export (${cellCount} cells): ${element.id}`,
            `element/${element.id}`,
          ),
        );
      }

      if (isExport) {
        const rowCount = element.rows.length + 1;
        const rowHeight = element.frame.height / Math.max(1, rowCount);
        if (rowHeight < EXPORT_MIN_TABLE_ROW_HEIGHT) {
          issues.push(
            factory.issue(
              "error",
              "content",
              `Table row height is too small for readable PPTX export (${rowHeight.toFixed(
                1,
              )}px): ${element.id}`,
              `element/${element.id}`,
            ),
          );
        }

        const allCells = [element.headers, ...element.rows].flat();
        const longestCell = allCells.reduce(
          (longest, cell) => (cell.length > longest.length ? cell : longest),
          "",
        );
        if (longestCell.length > EXPORT_MAX_CELL_CHARS) {
          issues.push(
            factory.issue(
              "warning",
              "content",
              `Table cell text is likely to wrap or shrink in PPTX export: ${element.id}`,
              `element/${element.id}`,
            ),
          );
        }

        const charsPerCellPixel =
          allCells.reduce((sum, cell) => sum + cell.length, 0) /
          Math.max(1, element.frame.width * element.frame.height);
        if (charsPerCellPixel > EXPORT_MAX_CELL_DENSITY / 1000) {
          issues.push(
            factory.issue(
              "warning",
              "content",
              `Table text density is high for PPTX export: ${element.id}`,
              `element/${element.id}`,
            ),
          );
        }
      }
    }
  }

  return issues;
}

type TextElement = Extract<PresentationIR["slides"][number]["elements"][number], { type: "text" }>;

function totalTextLength(textElements: TextElement[]): number {
  return textElements.reduce((sum, element) => sum + flattenText(element).trim().length, 0);
}

function flattenText(element: TextElement): string {
  return element.text.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n");
}
