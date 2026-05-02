import {
  ContentContractSchema,
} from "#src/schemas/intent-artifacts.js";

export type ContractWarning = {
  code: string;
  message: string;
};

export type ContractValidationResult = {
  valid: boolean;
  warnings: ContractWarning[];
};

/**
 * Validate a contentContract value against its Zod schema and
 * apply additional semantic checks (metric count limits, etc.).
 */
export function validateContentContract(
  contract: unknown,
): ContractValidationResult {
  const warnings: ContractWarning[] = [];

  // Zod schema validation
  const parsed = ContentContractSchema.safeParse(contract);
  if (!parsed.success) {
    return {
      valid: false,
      warnings: [
        {
          code: "contract_validation_failed",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        },
      ],
    };
  }

  const data = parsed.data;

  // Semantic checks per archetype
  if (data.archetype === "kpi_summary") {
    if (data.metrics.length > 6) {
      warnings.push({
        code: "too_many_metrics",
        message: `kpi_summary has ${data.metrics.length} metrics (max 6)`,
      });
    }
  }

  if (data.archetype === "approval_request") {
    if (!data.cta || data.cta.trim().length === 0) {
      warnings.push({
        code: "missing_cta",
        message: "approval_request requires a non-empty cta",
      });
    }
    if (data.approvalItems.length > 6) {
      warnings.push({
        code: "too_many_approval_items",
        message: `approval_request has ${data.approvalItems.length} items (max 6)`,
      });
    }
  }

  if (data.archetype === "trend_small_multiples") {
    if (data.series.length > 4) {
      warnings.push({
        code: "too_many_series",
        message: `trend_small_multiples has ${data.series.length} series (max 4)`,
      });
    }
  }

  if (data.archetype === "cause_analysis" && data.breakdown) {
    const nonComplement = data.breakdown.filter(
      (b) => b.source !== "derived_complement",
    );
    // If more than 2 "provided" entries, something may have been fabricated
    if (nonComplement.length > 2) {
      warnings.push({
        code: "possible_fabricated_breakdown",
        message: `cause_analysis has ${nonComplement.length} provided breakdown entries — verify data source`,
      });
    }
  }

  return {
    valid: true,
    warnings,
  };
}
