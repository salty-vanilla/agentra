import { BriefSchema, type PresentationBrief } from "@deck-forge/core";
import type { ValidationResult } from "#src/types.js";
import { flattenZodIssues } from "#src/validators/_internal.js";

export type ValidateBriefOptions = {
  /** Optional language code expected in `brief.output.language` (e.g. "ja"). */
  expectedLanguage?: string;
};

/**
 * Validate a PresentationBrief structurally (via Zod) plus a small number of
 * semantic checks. Returns `{ valid, issues }` instead of throwing so that an
 * LLM-orchestrator can decide to retry just this stage.
 */
export function validateBrief(
  brief: unknown,
  options: ValidateBriefOptions = {},
): ValidationResult {
  const parsed = BriefSchema.safeParse(brief);
  if (!parsed.success) {
    return { valid: false, issues: flattenZodIssues("brief", parsed.error) };
  }
  const issues = semanticIssues(parsed.data, options);
  return { valid: issues.length === 0, issues };
}

function semanticIssues(
  brief: PresentationBrief,
  { expectedLanguage }: ValidateBriefOptions,
): string[] {
  const issues: string[] = [];
  if (!brief.title.trim()) {
    issues.push("brief.title must not be empty");
  }
  const actualLanguage = brief.output.language;
  if (expectedLanguage === "ja" && actualLanguage && actualLanguage !== "ja") {
    issues.push(`brief.output.language: expected ja, received ${actualLanguage}`);
  }
  return issues;
}
