import type { PresentationIR, ValidationIssue } from "#src/index.js";
import type { IssueFactory } from "#src/validation/types.js";

export function validateStructural(
  presentation: PresentationIR,
  factory: IssueFactory,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (presentation.slides.length === 0) {
    issues.push(factory.issue("error", "structural", "Presentation must have at least one slide."));
    return issues;
  }

  const slideIds = new Set<string>();
  const elementIds = new Set<string>();

  for (const slide of presentation.slides) {
    if (slideIds.has(slide.id)) {
      issues.push(
        factory.issue(
          "error",
          "structural",
          `Duplicate slide id: ${slide.id}`,
          `slide/${slide.id}`,
        ),
      );
    }
    slideIds.add(slide.id);

    if (!slide.intent) {
      issues.push(
        factory.issue(
          "warning",
          "content",
          `Slide intent is missing: ${slide.id}`,
          `slide/${slide.id}`,
        ),
      );
    }

    if (!slide.title || slide.title.trim() === "") {
      issues.push(
        factory.issue(
          "warning",
          "content",
          `Slide title is empty: ${slide.id}`,
          `slide/${slide.id}`,
        ),
      );
    }

    for (const element of slide.elements) {
      if (elementIds.has(element.id)) {
        issues.push(
          factory.issue(
            "error",
            "structural",
            `Duplicate element id: ${element.id}`,
            `element/${element.id}`,
          ),
        );
      }
      elementIds.add(element.id);

      if (element.type === "table") {
        const columns = element.headers.length;
        const invalid = element.rows.find((row) => row.length !== columns);
        if (invalid) {
          issues.push(
            factory.issue(
              "error",
              "structural",
              `Table row column count mismatch in element: ${element.id}`,
              `element/${element.id}`,
            ),
          );
        }
      }

      if (element.type === "image") {
        const asset = presentation.assets.assets.find((item) => item.id === element.assetId);
        if (!asset) {
          issues.push(
            factory.issue(
              "error",
              "asset",
              `Image element references missing asset: ${element.assetId}`,
              `element/${element.id}`,
            ),
          );
        }
      }

      if (element.type === "chart") {
        if (element.data.series.length === 0) {
          issues.push(
            factory.issue(
              "error",
              "content",
              `Chart series is empty in element: ${element.id}`,
              `element/${element.id}`,
            ),
          );
        }
      }
    }
  }

  return issues;
}
