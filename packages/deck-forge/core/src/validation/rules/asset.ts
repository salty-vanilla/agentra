import type { PresentationIR, ValidationIssue } from "#src/index.js";
import type { IssueFactory } from "#src/validation/types.js";

/**
 * Validates asset registry integrity:
 * - Asset URIs must not be blank
 * - AssetUsage entries must reference slides and elements that exist in the presentation
 */
export function validateAssets(
  presentation: PresentationIR,
  factory: IssueFactory,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const slideIds = new Set(presentation.slides.map((s) => s.id));
  const elementIds = new Set(presentation.slides.flatMap((s) => s.elements.map((e) => e.id)));

  for (const asset of presentation.assets.assets) {
    if (!asset.uri || asset.uri.trim() === "") {
      issues.push(
        factory.issue("error", "asset", `Asset URI is empty: ${asset.id}`, `asset/${asset.id}`),
      );
    }

    if (asset.uri.startsWith("placeholder://")) {
      issues.push(
        factory.issue(
          "warning",
          "asset",
          `Placeholder asset remains unresolved: ${asset.id}`,
          `asset/${asset.id}`,
        ),
      );
    }

    if (asset.metadata.source === "external") {
      if (!asset.metadata.provider) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `External asset is missing provider metadata: ${asset.id}`,
            `asset/${asset.id}`,
          ),
        );
      }
      if (!asset.metadata.license) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `External asset is missing license metadata: ${asset.id}`,
            `asset/${asset.id}`,
          ),
        );
      }
      if (!asset.metadata.sourcePageUrl) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `External asset is missing source page URL metadata: ${asset.id}`,
            `asset/${asset.id}`,
          ),
        );
      }
      if (!asset.metadata.author) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `External asset is missing author metadata: ${asset.id}`,
            `asset/${asset.id}`,
          ),
        );
      }
    }

    for (const usage of asset.usage) {
      if (!slideIds.has(usage.slideId)) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `Asset usage references non-existent slide: ${usage.slideId} (asset: ${asset.id})`,
            `asset/${asset.id}`,
          ),
        );
      }

      if (!elementIds.has(usage.elementId)) {
        issues.push(
          factory.issue(
            "warning",
            "asset",
            `Asset usage references non-existent element: ${usage.elementId} (asset: ${asset.id})`,
            `asset/${asset.id}`,
          ),
        );
      }
    }
  }

  return issues;
}
