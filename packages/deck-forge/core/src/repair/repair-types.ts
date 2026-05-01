import type { PresentationIR, PresentationOperation, ValidationIssue } from "#src/index.js";

export type RepairRuleName =
  | "out-of-bounds"
  | "unhonored-region-ref"
  | "duplicate-frame"
  | "table-sidebar-overlap"
  | "title-footer-misplacement"
  | "significant-overlap";

export type RepairOptions = {
  /** When true, propose operations without applying them. */
  dryRun?: boolean;
  /** Subset of rules to run. Default: all rules in priority order. */
  rules?: RepairRuleName[];
};

export type RepairOperationRecord = {
  operation: PresentationOperation;
  status: "applied" | "skipped" | "proposed";
  reason?: string;
  ruleId: RepairRuleName;
};

export type RepairResult = {
  presentation: PresentationIR;
  proposed: RepairOperationRecord[];
  applied: RepairOperationRecord[];
  skipped: RepairOperationRecord[];
  issuesBefore: ValidationIssue[];
  issuesAfter: ValidationIssue[];
  summary: RepairSummary;
};

export type RepairSummary = {
  proposedCount: number;
  appliedCount: number;
  skippedCount: number;
  issueCountBefore: number;
  issueCountAfter: number;
};

export type RepairRuleResult = {
  operations: PresentationOperation[];
  handledIssueIds: Set<string>;
};
