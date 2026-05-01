import {
  findDuplicateFrameGroups,
  frameOverlapRatio,
} from "#src/geometry/frame-geometry.js";
import type { PresentationIR, ValidationIssue } from "#src/index.js";
import { suggestMoveInBounds } from "#src/validation/autofix/auto-fix-presentation.js";
import type { IssueFactory, ValidateLevel } from "#src/validation/types.js";

const EXPORT_OVERLAP_ERROR_RATIO = 0.18;
/**
 * Content-on-content overlap above this ratio is treated as a hard layout
 * error at every validation level. Background / very-low-opacity decorative
 * elements are excluded via {@link isIgnorableExportOverlap}.
 */
const SIGNIFICANT_OVERLAP_ERROR_RATIO = 0.4;
/**
 * A region's `contentRefs` is honored when the referenced element's frame
 * overlaps the region by at least this ratio.
 */
const REGION_REF_HONORED_OVERLAP = 0.8;

export function validateLayout(
  presentation: PresentationIR,
  factory: IssueFactory,
  options: { level?: ValidateLevel } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const isExport = options.level === "export";

  for (const slide of presentation.slides) {
    const size = slide.layout.slideSize;
    const hasTitle = slide.elements.some(
      (element) => element.type === "text" && element.role === "title",
    );

    if (!hasTitle) {
      const issue = factory.issue(
        "warning",
        "layout",
        `Title text element is missing on slide: ${slide.id}`,
        `slide/${slide.id}`,
      );
      issue.id = `layout/missing-title/${slide.id}`;
      issues.push(issue);
    }

    for (const element of slide.elements) {
      const frame = element.frame;

      if (frame.width <= 0 || frame.height <= 0) {
        const issue = factory.issue(
          "error",
          "layout",
          `Element frame has non-positive size: ${element.id}`,
          `element/${element.id}`,
        );
        issue.id = `layout/non-positive-size/${slide.id}/${element.id}`;
        issues.push(issue);
      }

      if (
        frame.x < 0 ||
        frame.y < 0 ||
        frame.x + frame.width > size.width ||
        frame.y + frame.height > size.height
      ) {
        const clampedX = Math.max(0, frame.x);
        const clampedY = Math.max(0, frame.y);
        const issue = factory.issue(
          "error",
          "layout",
          `Element frame is out of slide bounds: ${element.id}`,
          `element/${element.id}`,
        );
        issue.id = `layout/out-of-bounds/${slide.id}/${element.id}`;
        issue.autoFixable = true;
        issue.suggestedFix = suggestMoveInBounds(element.id, clampedX, clampedY);
        issues.push(issue);
      }

      if (frame.x < 12 || frame.y < 12) {
        const issue = factory.issue(
          "warning",
          "layout",
          `Element margin is very tight: ${element.id}`,
          `element/${element.id}`,
        );
        issue.id = `layout/tight-margin/${slide.id}/${element.id}`;
        issues.push(issue);
      }

      if (frame.height > 0 && frame.height < 60) {
        const issue = factory.issue(
          "warning",
          "layout",
          `Element ${element.id} frame height ${frame.height} is below the minimum readable height of 60`,
          `element/${element.id}`,
        );
        issue.id = `layout/min-height/${slide.id}/${element.id}`;
        issues.push(issue);
      }
    }

    for (let leftIndex = 0; leftIndex < slide.elements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < slide.elements.length; rightIndex += 1) {
        const left = slide.elements[leftIndex];
        const right = slide.elements[rightIndex];
        if (!left || !right) {
          continue;
        }

        const overlapRatio = frameOverlapRatio(left.frame, right.frame);
        if (overlapRatio > 0.08) {
          const ignorable = isIgnorableExportOverlap(left, right);
          let severity: ValidationIssue["severity"] = "warning";
          if (!ignorable && overlapRatio >= SIGNIFICANT_OVERLAP_ERROR_RATIO) {
            severity = "error";
          } else if (
            isExport &&
            overlapRatio >= EXPORT_OVERLAP_ERROR_RATIO &&
            !ignorable
          ) {
            severity = "error";
          }
          const sortedIds = [left.id, right.id].sort();
          const issue = factory.issue(
            severity,
            "layout",
            `Elements overlap on slide ${slide.id}: ${left.id} and ${right.id}`,
            `slide/${slide.id}`,
          );
          issue.id = `layout/overlap/${slide.id}/${sortedIds.join("+")}`;
          issues.push(issue);
        }
      }
    }

    // duplicate-frame: two or more content-bearing elements share an identical
    // frame. This typically indicates that LLM-generated operations stamped the
    // same coordinates on multiple callouts/text blocks.
    const contentElements = slide.elements.filter((element) => !isBackgroundLike(element));
    const duplicateGroups = findDuplicateFrameGroups(
      contentElements.map((element) => element.frame),
    );
    for (const group of duplicateGroups) {
      const ids = group
        .map((index) => contentElements[index]?.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length < 2) continue;
      const sortedIds = [...ids].sort();
      const issue = factory.issue(
        "error",
        "layout",
        `Duplicate element frames on slide ${slide.id}: ${ids.join(", ")}`,
        `slide/${slide.id}`,
      );
      issue.id = `layout/duplicate-frame/${slide.id}/${sortedIds.join("+")}`;
      issues.push(issue);
    }

    // unhonored-region-ref: a region's contentRefs names an element whose frame
    // does not lie within (or sufficiently overlap) the region frame. After
    // reflow this should not happen; a recurring warning means the LLM keeps
    // moving an element away from its declared region.
    for (const region of slide.layout.regions) {
      for (const ref of region.contentRefs) {
        const element = slide.elements.find((candidate) => candidate.id === ref);
        if (!element) continue;
        const overlap = frameOverlapRatio(element.frame, region.frame);
        if (overlap < REGION_REF_HONORED_OVERLAP) {
          const issue = factory.issue(
            "warning",
            "layout",
            `Region '${region.id}' on slide ${slide.id} declares contentRef '${ref}' but the element frame does not occupy the region`,
            `slide/${slide.id}`,
          );
          issue.id = `layout/unhonored-region-ref/${slide.id}/${region.id}/${ref}`;
          issues.push(issue);
        }
      }
    }
  }

  return issues;
}

function isIgnorableExportOverlap(
  left: PresentationIR["slides"][number]["elements"][number],
  right: PresentationIR["slides"][number]["elements"][number],
): boolean {
  return isBackgroundLike(left) || isBackgroundLike(right);
}

function isBackgroundLike(element: PresentationIR["slides"][number]["elements"][number]): boolean {
  if (element.type === "image" && element.role === "background") {
    return true;
  }

  if (element.type !== "shape") {
    return false;
  }

  const fillOpacity = element.style.opacity ?? 1;
  return fillOpacity <= 0.15;
}
