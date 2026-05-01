import type { PresentationIR, ValidationIssue, ValidationReport } from "#src/index.js";
import { autoFixPresentation } from "#src/validation/autofix/auto-fix-presentation.js";
import { validateAssets } from "#src/validation/rules/asset.js";
import { validateContent } from "#src/validation/rules/content.js";
import { validateContentDensity } from "#src/validation/rules/content-density.js";
import { validateLayout } from "#src/validation/rules/layout.js";
import { validateStructural } from "#src/validation/rules/structural.js";
import { validateStyle } from "#src/validation/rules/style.js";
import type { ValidateOptions, ValidateResult } from "#src/validation/types.js";

export async function validatePresentation(
  presentation: PresentationIR,
  options?: ValidateOptions,
): Promise<ValidationReport>;

export async function validatePresentation(
  presentation: PresentationIR,
  options: ValidateOptions & { autoFix: true },
): Promise<ValidateResult>;

export async function validatePresentation(
  presentation: PresentationIR,
  options?: ValidateOptions,
): Promise<ValidationReport | ValidateResult> {
  const level = options?.level ?? "basic";
  const issueBuilder = createIssueBuilder();

  const issues: ValidationIssue[] = [
    ...validateStructural(presentation, issueBuilder),
    ...validateLayout(presentation, issueBuilder, { level }),
    ...validateStyle(presentation, issueBuilder, { level }),
    ...validateContent(presentation, issueBuilder, { level }),
    ...validateContentDensity(presentation, issueBuilder, { level }),
    ...validateAssets(presentation, issueBuilder),
  ];

  if (level === "strict") {
    if (presentation.slides.length < 2) {
      issues.push(
        issueBuilder.issue(
          "warning",
          "content",
          "Strict mode expects at least two slides for narrative continuity.",
          `deck/${presentation.id}`,
        ),
      );
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const infoCount = issues.filter((issue) => issue.severity === "info").length;

  const report: ValidationReport = {
    status: errorCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed",
    issues,
    summary: {
      errorCount,
      warningCount,
      infoCount,
    },
  };

  if (options?.autoFix) {
    const fixed = autoFixPresentation(presentation, report);
    return { report, presentation: fixed };
  }

  return report;
}

function createIssueBuilder(): {
  issue: (
    severity: ValidationIssue["severity"],
    category: ValidationIssue["category"],
    message: string,
    target?: string,
  ) => ValidationIssue;
} {
  let index = 0;

  return {
    issue: (severity, category, message, target) => {
      index += 1;
      return {
        id: `vi-${index}`,
        severity,
        category,
        message,
        target,
      };
    },
  };
}
