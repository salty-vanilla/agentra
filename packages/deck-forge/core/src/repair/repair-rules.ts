import {
  clampFrameToSlide,
  frameOverlapRatio,
  stackFramesVertically,
} from "#src/geometry/frame-geometry.js";
import type {
  ElementIR,
  PresentationIR,
  PresentationOperation,
  SlideIR,
  ValidationIssue,
} from "#src/index.js";
import type { RepairRuleResult } from "#src/repair/repair-types.js";

// ---------------------------------------------------------------------------
// ID parsing helpers
// ---------------------------------------------------------------------------

function parseIdSegments(issueId: string, prefix: string): string[] {
  return issueId.slice(prefix.length).split("/");
}

function findSlide(presentation: PresentationIR, slideId: string): SlideIR | undefined {
  return presentation.slides.find((s) => s.id === slideId);
}

function findElement(slide: SlideIR, elementId: string): ElementIR | undefined {
  return slide.elements.find((e) => e.id === elementId);
}

// ---------------------------------------------------------------------------
// Rule 1: out-of-bounds
// ---------------------------------------------------------------------------

const OOB_PREFIX = "layout/out-of-bounds/";

export function repairOutOfBounds(
  presentation: PresentationIR,
  issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  for (const issue of issues) {
    if (!issue.id.startsWith(OOB_PREFIX)) continue;

    const segments = parseIdSegments(issue.id, OOB_PREFIX);
    const slideId = segments[0];
    const elementId = segments[1];
    if (!slideId || !elementId) continue;

    const slide = findSlide(presentation, slideId);
    if (!slide) continue;

    const element = findElement(slide, elementId);
    if (!element) continue;

    const clamped = clampFrameToSlide(element.frame, slide.layout.slideSize);
    operations.push({
      type: "set_element_frame",
      slideId,
      elementId,
      frame: { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height },
    });
    handledIssueIds.add(issue.id);
  }

  return { operations, handledIssueIds };
}

// ---------------------------------------------------------------------------
// Rule 2: unhonored-region-ref
// ---------------------------------------------------------------------------

const UNHONORED_PREFIX = "layout/unhonored-region-ref/";

export function repairUnhonoredRegionRef(
  presentation: PresentationIR,
  issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  for (const issue of issues) {
    if (!issue.id.startsWith(UNHONORED_PREFIX)) continue;

    const segments = parseIdSegments(issue.id, UNHONORED_PREFIX);
    const slideId = segments[0];
    const regionId = segments[1];
    const elementRef = segments[2];
    if (!slideId || !regionId || !elementRef) continue;

    const slide = findSlide(presentation, slideId);
    if (!slide) continue;

    const region = slide.layout.regions.find((r) => r.id === regionId);
    if (!region) continue;

    // If region has multiple contentRefs, use set_element_region to trigger
    // reflow and avoid duplicate frames.
    if (region.contentRefs.length > 1) {
      operations.push({
        type: "set_element_region",
        slideId,
        elementId: elementRef,
        regionId,
      });
    } else {
      // Single contentRef: place element within the region frame directly.
      const rf = region.frame;
      operations.push({
        type: "set_element_frame",
        slideId,
        elementId: elementRef,
        frame: { x: rf.x, y: rf.y, width: rf.width, height: rf.height },
      });
    }
    handledIssueIds.add(issue.id);
  }

  return { operations, handledIssueIds };
}

// ---------------------------------------------------------------------------
// Rule 3: duplicate-frame
// ---------------------------------------------------------------------------

const DUP_PREFIX = "layout/duplicate-frame/";

export function repairDuplicateFrame(
  presentation: PresentationIR,
  issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  for (const issue of issues) {
    if (!issue.id.startsWith(DUP_PREFIX)) continue;

    const segments = parseIdSegments(issue.id, DUP_PREFIX);
    const slideId = segments[0];
    const idsJoined = segments[1];
    if (!slideId || !idsJoined) continue;

    const elementIds = idsJoined.split("+");
    if (elementIds.length < 2) continue;

    const slide = findSlide(presentation, slideId);
    if (!slide) continue;

    // Find a parent region that contains any of the duplicate elements.
    const parentRegion = slide.layout.regions.find((r) =>
      r.contentRefs.some((ref) => elementIds.includes(ref)),
    );

    const containerFrame = parentRegion
      ? parentRegion.frame
      : {
          x: 40,
          y: 40,
          width: slide.layout.slideSize.width - 80,
          height: slide.layout.slideSize.height - 80,
        };

    const frames = stackFramesVertically(containerFrame, elementIds.length);

    for (let i = 0; i < elementIds.length; i++) {
      const eid = elementIds[i]!;
      const frame = frames[i]!;
      operations.push({
        type: "set_element_frame",
        slideId,
        elementId: eid,
        frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      });
    }
    handledIssueIds.add(issue.id);
  }

  return { operations, handledIssueIds };
}

// ---------------------------------------------------------------------------
// Rule 4: table-sidebar-overlap
// ---------------------------------------------------------------------------

const OVERLAP_PREFIX = "layout/overlap/";

const SIDEBAR_ROLES = new Set(["body", "callout", "caption", "footer"]);

function isTableElement(el: ElementIR): boolean {
  return el.type === "table";
}

function isSidebarLikeElement(el: ElementIR): boolean {
  if (el.type !== "text") return false;
  return SIDEBAR_ROLES.has(el.role);
}

export function repairTableSidebarOverlap(
  presentation: PresentationIR,
  issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  for (const issue of issues) {
    if (!issue.id.startsWith(OVERLAP_PREFIX)) continue;

    const segments = parseIdSegments(issue.id, OVERLAP_PREFIX);
    const slideId = segments[0];
    const idsJoined = segments[1];
    if (!slideId || !idsJoined) continue;

    const elementIds = idsJoined.split("+");
    if (elementIds.length !== 2) continue;

    const slide = findSlide(presentation, slideId);
    if (!slide) continue;

    const elA = findElement(slide, elementIds[0]!);
    const elB = findElement(slide, elementIds[1]!);
    if (!elA || !elB) continue;

    // Check if one is table and other is sidebar-like text
    let tableEl: ElementIR | undefined;
    let sidebarEl: ElementIR | undefined;
    if (isTableElement(elA) && isSidebarLikeElement(elB)) {
      tableEl = elA;
      sidebarEl = elB;
    } else if (isTableElement(elB) && isSidebarLikeElement(elA)) {
      tableEl = elB;
      sidebarEl = elA;
    }

    if (!tableEl || !sidebarEl) continue;

    // Determine the container frame with fallback order:
    // 1. Shared region frame (if both elements belong to the same region)
    // 2. Pair bounding box
    // 3. Slide safe area
    const sharedRegion = slide.layout.regions.find(
      (r) => r.contentRefs.includes(tableEl!.id) && r.contentRefs.includes(sidebarEl!.id),
    );
    const anyRegion =
      sharedRegion ??
      slide.layout.regions.find(
        (r) => r.contentRefs.includes(tableEl!.id) || r.contentRefs.includes(sidebarEl!.id),
      );

    let containerX: number;
    let containerY: number;
    let totalWidth: number;
    let height: number;

    if (anyRegion) {
      containerX = anyRegion.frame.x;
      containerY = anyRegion.frame.y;
      totalWidth = anyRegion.frame.width;
      height = anyRegion.frame.height;
    } else {
      // Fallback to pair bounding box
      containerX = Math.min(tableEl.frame.x, sidebarEl.frame.x);
      containerY = Math.min(tableEl.frame.y, sidebarEl.frame.y);
      const maxX = Math.max(
        tableEl.frame.x + tableEl.frame.width,
        sidebarEl.frame.x + sidebarEl.frame.width,
      );
      const maxBottom = Math.max(
        tableEl.frame.y + tableEl.frame.height,
        sidebarEl.frame.y + sidebarEl.frame.height,
      );
      totalWidth = maxX - containerX;
      height = maxBottom - containerY;
    }

    const gap = 12;

    // 65% table, 35% sidebar
    const tableWidth = Math.floor((totalWidth - gap) * 0.65);
    const sidebarWidth = totalWidth - gap - tableWidth;

    operations.push({
      type: "set_element_frame",
      slideId,
      elementId: tableEl.id,
      frame: { x: containerX, y: containerY, width: tableWidth, height },
    });
    operations.push({
      type: "set_element_frame",
      slideId,
      elementId: sidebarEl.id,
      frame: { x: containerX + tableWidth + gap, y: containerY, width: sidebarWidth, height },
    });
    handledIssueIds.add(issue.id);
  }

  return { operations, handledIssueIds };
}

// ---------------------------------------------------------------------------
// Rule 5: title-footer-misplacement (direct inspection, no issue to match)
// ---------------------------------------------------------------------------

const FOOTER_BODY_THRESHOLD = 0.7;

export function repairTitleFooterMisplacement(
  presentation: PresentationIR,
  _issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  for (const slide of presentation.slides) {
    if (slide.layout.spec.type !== "title") continue;

    const slideHeight = slide.layout.slideSize.height;
    const bodyThresholdY = slideHeight * FOOTER_BODY_THRESHOLD;

    for (const element of slide.elements) {
      if (element.type !== "text") continue;
      if (element.role !== "footer" && element.role !== "caption") continue;
      if (element.frame.y >= bodyThresholdY) continue;

      // Element is in the body area of a title slide — move it to the bottom.
      const footerRegion = slide.layout.regions.find((r) => r.role === "footer");

      const targetFrame = footerRegion
        ? {
            x: footerRegion.frame.x,
            y: footerRegion.frame.y,
            width: footerRegion.frame.width,
            height: footerRegion.frame.height,
          }
        : {
            x: slide.layout.slideSize.width * 0.05,
            y: slideHeight * 0.85,
            width: slide.layout.slideSize.width * 0.9,
            height: slideHeight * 0.1,
          };

      operations.push({
        type: "set_element_frame",
        slideId: slide.id,
        elementId: element.id,
        frame: targetFrame,
      });
    }
  }

  return { operations, handledIssueIds };
}

// ---------------------------------------------------------------------------
// Rule 6: significant-overlap fallback
// ---------------------------------------------------------------------------

/**
 * Build connected components from overlap pairs using union-find.
 */
function buildOverlapComponents(pairs: [string, string][]): string[][] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    // Path compression
    let curr = x;
    while (curr !== root) {
      const next = parent.get(curr) ?? curr;
      parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    union(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const node of parent.keys()) {
    const root = find(node);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(node);
  }

  return [...groups.values()];
}

export function repairSignificantOverlap(
  presentation: PresentationIR,
  issues: ValidationIssue[],
): RepairRuleResult {
  const operations: PresentationOperation[] = [];
  const handledIssueIds = new Set<string>();

  // Collect overlap pairs grouped by slide.
  const pairsBySlide = new Map<string, [string, string][]>();

  for (const issue of issues) {
    if (!issue.id.startsWith(OVERLAP_PREFIX)) continue;

    const segments = parseIdSegments(issue.id, OVERLAP_PREFIX);
    const slideId = segments[0];
    const idsJoined = segments[1];
    if (!slideId || !idsJoined) continue;

    const elementIds = idsJoined.split("+");
    if (elementIds.length !== 2) continue;

    if (!pairsBySlide.has(slideId)) pairsBySlide.set(slideId, []);
    pairsBySlide.get(slideId)!.push([elementIds[0]!, elementIds[1]!]);
    handledIssueIds.add(issue.id);
  }

  for (const [slideId, pairs] of pairsBySlide) {
    const slide = findSlide(presentation, slideId);
    if (!slide) continue;

    // Build connected components so independent overlap groups are repaired separately.
    const components = buildOverlapComponents(pairs);

    for (const component of components) {
      const elements = component
        .map((eid) => findElement(slide, eid))
        .filter((el): el is ElementIR => el != null);

      if (elements.length < 2) continue;

      // Find a shared region, or fall back to slide bounds.
      const sharedRegion = slide.layout.regions.find((r) =>
        elements.some((el) => r.contentRefs.includes(el.id)),
      );

      const containerFrame = sharedRegion
        ? sharedRegion.frame
        : {
            x: 40,
            y: 40,
            width: slide.layout.slideSize.width - 80,
            height: slide.layout.slideSize.height - 80,
          };

      const frames = stackFramesVertically(containerFrame, elements.length);

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]!;
        const frame = frames[i]!;
        operations.push({
          type: "set_element_frame",
          slideId,
          elementId: el.id,
          frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        });
      }
    }
  }

  return { operations, handledIssueIds };
}
