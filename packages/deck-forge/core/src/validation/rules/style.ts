import type { PresentationIR, ValidationIssue } from "#src/index.js";
import {
  suggestApplyThemeToken,
  suggestReduceFontSize,
} from "#src/validation/autofix/auto-fix-presentation.js";
import type { IssueFactory, ValidateLevel } from "#src/validation/types.js";

const MIN_FONT_SIZE = 12;
const EXPORT_MIN_FONT_SIZE = 10;

export function validateStyle(
  presentation: PresentationIR,
  factory: IssueFactory,
  options: { level?: ValidateLevel } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isExport = options.level === "export";

  for (const slide of presentation.slides) {
    const background = slide.layout.spec.type
      ? (presentation.theme.slideDefaults.backgroundColor ?? presentation.theme.colors.background)
      : presentation.theme.colors.background;

    for (const element of slide.elements) {
      if (element.type !== "text") {
        continue;
      }

      const fontSize = element.style.fontSize ?? presentation.theme.typography.fontSize.body;
      if (fontSize < MIN_FONT_SIZE) {
        const severity = isExport && fontSize < EXPORT_MIN_FONT_SIZE ? "error" : "warning";
        const issue = factory.issue(
          severity,
          "style",
          `Font size is too small (${fontSize}) in element: ${element.id}`,
          `element/${element.id}`,
        );
        issue.autoFixable = true;
        issue.suggestedFix = suggestReduceFontSize(element.id);
        issues.push(issue);
      }

      if (
        element.style.color &&
        normalizeColor(element.style.color) === normalizeColor(background)
      ) {
        const issue = factory.issue(
          "warning",
          "style",
          `Text color has low contrast against background in element: ${element.id}`,
          `element/${element.id}`,
        );
        issue.autoFixable = true;
        issue.suggestedFix = suggestApplyThemeToken(element.id, "textPrimary");
        issues.push(issue);
      }
    }
  }

  return issues;
}

function normalizeColor(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}
