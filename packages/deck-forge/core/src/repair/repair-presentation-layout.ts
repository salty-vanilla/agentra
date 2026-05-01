import type { PresentationIR, PresentationOperation, ValidationIssue } from "#src/index.js";
import type { OperationHandlerResult } from "#src/operations/handler-result.js";
import { setElementFrame } from "#src/operations/handlers/set-element-frame.js";
import { setElementRegion } from "#src/operations/handlers/set-element-region.js";
import { clonePresentation } from "#src/operations/utils.js";
import {
  repairDuplicateFrame,
  repairOutOfBounds,
  repairSignificantOverlap,
  repairTableSidebarOverlap,
  repairTitleFooterMisplacement,
  repairUnhonoredRegionRef,
} from "#src/repair/repair-rules.js";
import type {
  RepairOperationRecord,
  RepairOptions,
  RepairResult,
  RepairRuleName,
} from "#src/repair/repair-types.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

type RuleEntry = {
  name: RepairRuleName;
  fn: (
    presentation: PresentationIR,
    issues: ValidationIssue[],
  ) => { operations: PresentationOperation[]; handledIssueIds: Set<string> };
};

const ALL_RULES: RuleEntry[] = [
  { name: "out-of-bounds", fn: repairOutOfBounds },
  { name: "unhonored-region-ref", fn: repairUnhonoredRegionRef },
  { name: "duplicate-frame", fn: repairDuplicateFrame },
  { name: "table-sidebar-overlap", fn: repairTableSidebarOverlap },
  { name: "title-footer-misplacement", fn: repairTitleFooterMisplacement },
  { name: "significant-overlap", fn: repairSignificantOverlap },
];

function filterLayoutIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.category === "layout");
}

function applyOperation(
  presentation: PresentationIR,
  operation: PresentationOperation,
): OperationHandlerResult {
  switch (operation.type) {
    case "set_element_frame":
      return setElementFrame(presentation, operation);
    case "set_element_region":
      return setElementRegion(presentation, operation);
    default:
      return { status: "skipped", reason: "unsupported_operation" };
  }
}

export async function repairPresentationLayout(input: {
  presentation: PresentationIR;
  issues?: ValidationIssue[];
  options?: RepairOptions;
}): Promise<RepairResult> {
  const { presentation, options } = input;
  const dryRun = options?.dryRun ?? false;

  const cloned = clonePresentation(presentation);

  // Obtain layout issues.
  let issuesBefore: ValidationIssue[];
  if (input.issues) {
    issuesBefore = filterLayoutIssues(input.issues);
  } else {
    const report = await validatePresentation(cloned);
    issuesBefore = filterLayoutIssues(report.issues);
  }

  // Select rules to run.
  const rulesToRun = options?.rules
    ? ALL_RULES.filter((r) => options.rules!.includes(r.name))
    : ALL_RULES;

  const handledIssueIds = new Set<string>();
  const allRecords: RepairOperationRecord[] = [];

  for (const rule of rulesToRun) {
    // Filter to issues not already handled by prior rules.
    const remainingIssues = issuesBefore.filter((i) => !handledIssueIds.has(i.id));
    const result = rule.fn(cloned, remainingIssues);

    for (const id of result.handledIssueIds) {
      handledIssueIds.add(id);
    }

    for (const operation of result.operations) {
      if (dryRun) {
        allRecords.push({ operation, status: "proposed", ruleId: rule.name });
        continue;
      }

      const handlerResult = applyOperation(cloned, operation);
      if (handlerResult.status === "skipped") {
        allRecords.push({
          operation,
          status: "skipped",
          reason: handlerResult.reason,
          ruleId: rule.name,
        });
      } else {
        allRecords.push({ operation, status: "applied", ruleId: rule.name });
      }
    }
  }

  // Re-validate to get issues after repair.
  const reportAfter = await validatePresentation(cloned);
  const issuesAfter = filterLayoutIssues(reportAfter.issues);

  const proposed = allRecords;
  const applied = allRecords.filter((r) => r.status === "applied");
  const skipped = allRecords.filter((r) => r.status === "skipped");

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
