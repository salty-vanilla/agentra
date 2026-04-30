import type { PresentationIR, ValidationIssue } from "#src/index.js";

export type ValidateLevel = "basic" | "strict" | "export";

export type ValidateOptions = {
  level?: ValidateLevel;
  /**
   * When true, attemps to auto-fix autoFixable issues and returns the
   * corrected presentation alongside the report.
   */
  autoFix?: boolean;
};

export type ValidateResult = {
  report: ValidationReport;
  /** Present when autoFix was requested. Contains the fixed presentation. */
  presentation?: PresentationIR;
};

export type ValidationReport = import("#src/index.js").ValidationReport;

export type IssueFactory = {
  issue: (
    severity: ValidationIssue["severity"],
    category: ValidationIssue["category"],
    message: string,
    target?: string,
  ) => ValidationIssue;
};
