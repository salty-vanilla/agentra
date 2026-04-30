import type {
  PresentationIR,
  PresentationOperation,
  PresentationReviewPacket,
  PresentationRuntime,
  ValidationReport,
} from "@deck-forge/core";
import { autoFixPresentation, buildReviewPacket } from "@deck-forge/core";
import {
  applyPresentationOperationsHandler,
  buildPresentationIrHandler,
  componentPreflightHandler,
  componentSynthesizeHandler,
  exportPresentationHandler,
  generateAssetPlanHandler,
  inspectPresentationHandler,
  planPresentationOperationsHandler,
  reviewPresentationHandler,
  validateAgentCreateArtifacts,
  validatePresentationHandler,
} from "@deck-forge/tools";
import type {
  IntentParser,
  PresentationOperationPlanner,
  PresentationReviewer,
  StructuredIntent,
} from "@deck-forge/tools";

export type DeckForgeRunnerOptions = {
  runtime: PresentationRuntime;
  intentParser?: IntentParser;
  revisionPolicy?: "none" | "validation_only" | "ai_review";
  reviewTrigger?: "errors" | "warnings" | "always";
  maxRevisionLoops?: number;
  reviewer?: PresentationReviewer;
  operationPlanner?: PresentationOperationPlanner;
};

export type DeckForgeRunInput = {
  goal: string;
  mode?: "create" | "modify";
  exportFormat?: "pptx" | "html" | "json" | "pdf";
  validationLevel?: "basic" | "strict" | "export";
  autoFix?: boolean;
  outputPath?: string;
  includeTrace?: boolean;
  acquisitionMode?: "generate" | "retrieve" | "auto";
  imageProvider?: "pexels" | "unsplash" | "pixabay";
  presentation?: unknown;
  operations?: unknown[];
  inspectQuery?: unknown;
};

type RunnerStep =
  | "parse_request"
  | "validate_agent_artifacts"
  | "component_preflight"
  | "component_synthesize"
  | "generate_asset_plan"
  | "build_ir"
  | "inspect"
  | "apply_operations"
  | "validate"
  | "auto_fix"
  | "build_review_packet"
  | "review"
  | "plan_operations"
  | "revalidate"
  | "export";

type RunnerErrorCategory =
  | "input_error"
  | "nlu_error"
  | "validation_error"
  | "export_error"
  | "review_error"
  | "pipeline_error"
  | "policy_error";

type RunnerError = {
  category: RunnerErrorCategory;
  step: RunnerStep;
  message: string;
};

type RunnerTrace = {
  step: RunnerStep;
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  details?: string;
};

type RevisionSummary = {
  policy: "none" | "validation_only" | "ai_review";
  loopsExecuted: number;
  operationsApplied: number;
  trace: RevisionTraceEntry[];
};

type RevisionTraceEntry = {
  loopIndex: number;
  issueCount: number;
  operationCount: number;
  operationHash?: string;
  validationStatus: ValidationReport["status"];
  validationErrorCount: number;
  stopReason?: string;
};

export type DeckForgeRunResult = {
  finalStatus: "success" | "failed";
  mode: "create" | "modify";
  appliedPolicy: PresentationPolicy;
  artifacts: Record<string, unknown>;
  validationReport?: unknown;
  exportResult?: unknown;
  componentTrace?: {
    missingCount: number;
    createdCount: number;
  };
  revision?: RevisionSummary;
  errors: RunnerError[];
  trace?: RunnerTrace[];
};

type PresentationPolicy = {
  roleStyle: "senior_consultant";
  narrativeStyle: "decision_oriented";
  designStyle: "refined_minimal";
  visualPreset: "balanced" | "visual_heavy" | "data_heavy";
};

export class DeckForgeRunner {
  constructor(private readonly options: DeckForgeRunnerOptions) {
    if (
      options.revisionPolicy === "ai_review" &&
      (!options.reviewer || !options.operationPlanner)
    ) {
      throw new Error(
        "REVIEWER_ERROR: ai_review policy requires both reviewer and operationPlanner.",
      );
    }
  }

  async run(input: string | DeckForgeRunInput) {
    const payload: DeckForgeRunInput =
      typeof input === "string" ? { goal: input, mode: "create" } : input;
    const mode = payload.mode ?? "create";
    const trace: RunnerTrace[] = [];
    const errors: RunnerError[] = [];
    const includeTrace = payload.includeTrace ?? false;
    const validationLevel = payload.validationLevel ?? "basic";
    const shouldAutoFix = payload.autoFix ?? true;
    const exportFormat = payload.exportFormat ?? "json";
    const revisionPolicy = this.options.revisionPolicy ?? "validation_only";
    const reviewTrigger = this.options.reviewTrigger ?? "errors";
    const maxRevisionLoops = Math.min(5, Math.max(0, this.options.maxRevisionLoops ?? 2));
    const appliedPolicy = resolvePresentationPolicy(payload.goal, payload.acquisitionMode);

    try {
      if (mode === "create") {
        const structuredIntent = await this.runStep("parse_request", trace, async () =>
          parseCreateIntent(this.options.intentParser, payload.goal),
        );
        const {
          brief,
          deckPlan,
          slideSpecs,
          assetSpecs: providedAssetSpecs,
        } = await this.runStep("validate_agent_artifacts", trace, async () => {
          const result = validateAgentCreateArtifacts({
            userRequest: payload.goal,
            intent: structuredIntent,
          });
          if (!result.valid || !result.artifacts) {
            // If the parser returned no createArtifacts at all, surface as an
            // NLU parse failure (preserves prior runner classification);
            // otherwise it's a structural validation failure.
            const prefix = structuredIntent.createArtifacts
              ? "VALIDATION_ERROR"
              : "NLU_PARSE_ERROR";
            throw new Error(
              `${prefix}: invalid agent create artifacts: ${result.issues.join("; ")}`,
            );
          }
          return result.artifacts;
        });
        const componentPreflight = await this.runStep("component_preflight", trace, async () =>
          componentPreflightHandler({ slideSpecs }),
        );
        const componentSynthesis =
          componentPreflight.result.missing.length > 0
            ? await this.runStep("component_synthesize", trace, async () =>
                componentSynthesizeHandler({ slideSpecs }),
              )
            : { created: [] };
        const assetSpecs =
          providedAssetSpecs ??
          (
            await this.runStep("generate_asset_plan", trace, async () =>
              generateAssetPlanHandler({
                brief,
                slideSpecs,
                acquisitionMode:
                  payload.acquisitionMode ?? toAcquisitionMode(appliedPolicy.visualPreset),
                imageProvider: payload.imageProvider ?? "pexels",
              }),
            )
          ).assetSpecs;
        let { presentation } = await this.runStep("build_ir", trace, async () =>
          buildPresentationIrHandler({
            brief,
            deckPlan,
            slideSpecs,
            assetSpecs,
          }),
        );

        const revision = await this.runRevisionLoop({
          presentation,
          payload,
          grounding: structuredIntent.grounding,
          validationLevel,
          shouldAutoFix,
          revisionPolicy,
          reviewTrigger,
          maxRevisionLoops,
          trace,
        });
        presentation = revision.presentation;

        const { result: exportResult } = await this.runStep("export", trace, async () =>
          exportPresentationHandler({
            presentation,
            format: exportFormat,
            outputPath: payload.outputPath,
          }),
        );

        return {
          finalStatus: "success",
          mode,
          appliedPolicy,
          artifacts: {
            structuredIntent,
            brief,
            deckPlan,
            slideSpecs,
            assetSpecs,
            presentation,
          },
          validationReport: revision.report,
          exportResult,
          componentTrace: {
            missingCount: componentPreflight.result.missing.length,
            createdCount: componentSynthesis.created.length,
          },
          revision: revision.summary,
          errors,
          trace: includeTrace ? trace : undefined,
        } satisfies DeckForgeRunResult;
      }

      if (!payload.presentation) {
        throw new Error("MODIFY_INPUT_ERROR: presentation is required for modify mode.");
      }

      const inspectResult = await this.runStep("inspect", trace, async () =>
        inspectPresentationHandler({
          presentation: payload.presentation as never,
          query:
            (payload.inspectQuery as never) ??
            ({
              include: ["summary", "slides", "assets"],
            } as never),
        }),
      );

      const structuredIntent = await this.runStep("parse_request", trace, async () =>
        parseModifyIntent(this.options.intentParser, payload.goal, inspectResult.result as never),
      );

      const operations = payload.operations ?? structuredIntent.modifyIntent?.operations;
      if (!Array.isArray(operations) || operations.length === 0) {
        throw new Error("NLU_PARSE_ERROR: modify intent did not provide operations.");
      }

      const { presentation: updatedPresentation } = await this.runStep(
        "apply_operations",
        trace,
        async () =>
          applyPresentationOperationsHandler({
            presentation: payload.presentation as never,
            operations: operations as never,
          }),
      );

      const revision = await this.runRevisionLoop({
        presentation: updatedPresentation,
        payload,
        grounding: structuredIntent.grounding,
        validationLevel,
        shouldAutoFix,
        revisionPolicy,
        reviewTrigger,
        maxRevisionLoops,
        trace,
      });

      const { result: exportResult } = await this.runStep("export", trace, async () =>
        exportPresentationHandler({
          presentation: revision.presentation,
          format: exportFormat,
          outputPath: payload.outputPath,
        }),
      );

      return {
        finalStatus: "success",
        mode,
        appliedPolicy,
        artifacts: {
          presentation: revision.presentation,
          operations,
          structuredIntent,
        },
        validationReport: revision.report,
        exportResult,
        componentTrace: {
          missingCount: 0,
          createdCount: 0,
        },
        revision: revision.summary,
        errors,
        trace: includeTrace ? trace : undefined,
      } satisfies DeckForgeRunResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        category: classifyError(message),
        step: trace[trace.length - 1]?.step ?? "parse_request",
        message,
      });
      return {
        finalStatus: "failed",
        mode,
        appliedPolicy,
        artifacts: {},
        errors,
        trace: includeTrace ? trace : undefined,
      } satisfies DeckForgeRunResult;
    }
  }

  private async runRevisionLoop(input: {
    presentation: PresentationIR;
    payload: DeckForgeRunInput;
    grounding?: StructuredIntent["grounding"];
    validationLevel: "basic" | "strict" | "export";
    shouldAutoFix: boolean;
    revisionPolicy: "none" | "validation_only" | "ai_review";
    reviewTrigger?: "errors" | "warnings" | "always";
    maxRevisionLoops: number;
    trace: RunnerTrace[];
  }): Promise<{
    presentation: PresentationIR;
    report: ValidationReport;
    summary: RevisionSummary;
  }> {
    let presentation = input.presentation;
    let operationsApplied = 0;
    let loopsExecuted = 0;
    const revisionTrace: RevisionTraceEntry[] = [];
    const seenOperationHashes = new Set<string>();

    let { report } = await this.runStep("validate", input.trace, async () =>
      validatePresentationHandler({
        presentation,
        level: input.validationLevel,
      }),
    );

    if (input.revisionPolicy === "validation_only") {
      while (
        loopsExecuted < input.maxRevisionLoops &&
        report.status === "failed" &&
        input.shouldAutoFix
      ) {
        loopsExecuted += 1;
        const prevErrorCount = report.summary.errorCount;
        presentation = await this.runStep("auto_fix", input.trace, async () =>
          autoFixPresentation(presentation, report),
        );
        ({ report } = await this.runStep("revalidate", input.trace, async () =>
          validatePresentationHandler({
            presentation,
            level: input.validationLevel,
          }),
        ));
        const improved = report.summary.errorCount < prevErrorCount;
        revisionTrace.push({
          loopIndex: loopsExecuted,
          issueCount: report.issues.length,
          operationCount: 0,
          validationStatus: report.status,
          validationErrorCount: report.summary.errorCount,
          stopReason: improved ? undefined : "no_validation_improvement",
        });
        if (!improved) {
          break;
        }
      }
    }

    if (input.revisionPolicy === "ai_review") {
      const reviewTrigger = input.reviewTrigger ?? this.options.reviewTrigger ?? "errors";
      while (loopsExecuted < input.maxRevisionLoops && shouldRunAiReview(report, reviewTrigger)) {
        loopsExecuted += 1;
        const prevErrorCount = report.summary.errorCount;
        const prevIssueCount = report.issues.length;
        const packet = await this.runStep("build_review_packet", input.trace, async () =>
          buildRunnerReviewPacket({
            runtime: this.options.runtime,
            presentation,
            payload: input.payload,
            report,
            grounding: input.grounding,
          }),
        );
        const reviewOutput = await this.runStep("review", input.trace, async () =>
          reviewPresentationHandler({
            presentation,
            report,
            goal: input.payload.goal,
            packet,
            reviewer: this.options.reviewer,
          }),
        );
        const issues = reviewOutput.issues;
        if (issues.length === 0) {
          revisionTrace.push({
            loopIndex: loopsExecuted,
            issueCount: 0,
            operationCount: 0,
            validationStatus: report.status,
            validationErrorCount: report.summary.errorCount,
            stopReason: "no_review_issues",
          });
          break;
        }

        const planOutput = await this.runStep("plan_operations", input.trace, async () =>
          planPresentationOperationsHandler({
            presentation,
            issues,
            goal: input.payload.goal,
            operationPlanner: this.options.operationPlanner,
          }),
        );
        const operations = planOutput.operations as PresentationOperation[];
        const operationHash = stableHashFromOperations(operations);
        if (operations.length === 0) {
          revisionTrace.push({
            loopIndex: loopsExecuted,
            issueCount: issues.length,
            operationCount: 0,
            validationStatus: report.status,
            validationErrorCount: report.summary.errorCount,
            stopReason: "no_planned_operations",
          });
          break;
        }

        if (seenOperationHashes.has(operationHash)) {
          revisionTrace.push({
            loopIndex: loopsExecuted,
            issueCount: issues.length,
            operationCount: operations.length,
            operationHash,
            validationStatus: report.status,
            validationErrorCount: report.summary.errorCount,
            stopReason: "repeated_operations",
          });
          break;
        }
        seenOperationHashes.add(operationHash);

        ({ presentation } = await this.runStep("apply_operations", input.trace, async () =>
          applyPresentationOperationsHandler({
            presentation,
            operations,
          }),
        ));
        operationsApplied += operations.length;

        ({ report } = await this.runStep("revalidate", input.trace, async () =>
          validatePresentationHandler({
            presentation,
            level: input.validationLevel,
          }),
        ));
        const improved =
          report.summary.errorCount < prevErrorCount || report.issues.length < prevIssueCount;
        revisionTrace.push({
          loopIndex: loopsExecuted,
          issueCount: issues.length,
          operationCount: operations.length,
          operationHash,
          validationStatus: report.status,
          validationErrorCount: report.summary.errorCount,
          stopReason: improved ? undefined : "no_issue_or_validation_improvement",
        });
        if (!improved) {
          break;
        }
      }
    }

    if (
      shouldRunAiReview(report, input.reviewTrigger ?? this.options.reviewTrigger ?? "errors") &&
      input.revisionPolicy !== "none" &&
      loopsExecuted >= input.maxRevisionLoops &&
      input.maxRevisionLoops > 0
    ) {
      input.trace.push({
        step: "revalidate",
        status: "success",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        details: "WARNING: max revision loops reached before full pass.",
      });
    }

    return {
      presentation,
      report,
      summary: {
        policy: input.revisionPolicy,
        loopsExecuted,
        operationsApplied,
        trace: revisionTrace,
      },
    };
  }

  private async runStep<T>(
    step: RunnerStep,
    trace: RunnerTrace[],
    fn: () => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date().toISOString();
    try {
      const value = await fn();
      trace.push({
        step,
        status: "success",
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trace.push({
        step,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        details: message,
      });
      throw error;
    }
  }
}

async function parseCreateIntent(
  parser: IntentParser | undefined,
  userRequest: string,
): Promise<StructuredIntent> {
  if (!parser) {
    throw new Error("NLU_PARSE_ERROR: IntentParser is required for create mode.");
  }
  const intent = await parser.parseCreate({ userRequest });
  assertIntentConfidence(intent);
  return intent;
}

async function parseModifyIntent(
  parser: IntentParser | undefined,
  userRequest: string,
  inspectSummary: Record<string, unknown>,
): Promise<StructuredIntent> {
  if (!parser) {
    throw new Error("NLU_PARSE_ERROR: IntentParser is required for modify mode.");
  }
  const intent = await parser.parseModify({ userRequest, inspectSummary });
  assertIntentConfidence(intent);
  return intent;
}

function assertIntentConfidence(intent: StructuredIntent): void {
  if (intent.confidence < 0.7) {
    throw new Error(
      `NLU_PARSE_ERROR: confidence too low (${intent.confidence}). missing=${(intent.missingFields ?? []).join(",")}`,
    );
  }
  if ((intent.missingFields?.length ?? 0) > 0) {
    throw new Error(`NLU_PARSE_ERROR: missing required fields: ${intent.missingFields?.join(",")}`);
  }
}

function shouldRunAiReview(
  report: ValidationReport,
  trigger: "errors" | "warnings" | "always",
): boolean {
  if (trigger === "always") {
    return true;
  }
  if (trigger === "warnings") {
    return report.summary.errorCount > 0 || report.summary.warningCount > 0;
  }
  return report.summary.errorCount > 0;
}

async function buildRunnerReviewPacket(input: {
  runtime: PresentationRuntime;
  presentation: PresentationIR;
  payload: DeckForgeRunInput;
  report: ValidationReport;
  grounding?: StructuredIntent["grounding"];
}): Promise<PresentationReviewPacket> {
  const options = {
    userRequest: input.payload.goal,
    validationReport: input.report,
    grounding: input.grounding,
    renderImages: true,
    imageFormat: "png" as const,
  };

  if (input.runtime.buildReviewPacket) {
    return input.runtime.buildReviewPacket(input.presentation, options);
  }

  return buildReviewPacket({
    ...options,
    presentation: input.presentation,
  });
}

function resolvePresentationPolicy(
  goal: string,
  acquisitionMode?: "generate" | "retrieve" | "auto",
): PresentationPolicy {
  const inferredVisualPreset = inferVisualPreset(goal);
  const visualPreset =
    acquisitionMode === "retrieve"
      ? "visual_heavy"
      : acquisitionMode === "generate"
        ? "data_heavy"
        : inferredVisualPreset;

  return {
    roleStyle: "senior_consultant",
    narrativeStyle: "decision_oriented",
    designStyle: "refined_minimal",
    visualPreset,
  };
}

function inferVisualPreset(goal: string): "balanced" | "visual_heavy" | "data_heavy" {
  const lower = goal.toLowerCase();
  if (
    lower.includes("dashboard") ||
    lower.includes("kpi") ||
    lower.includes("data") ||
    lower.includes("metric")
  ) {
    return "data_heavy";
  }
  if (
    lower.includes("visual") ||
    lower.includes("design") ||
    lower.includes("brand") ||
    lower.includes("story")
  ) {
    return "visual_heavy";
  }
  return "balanced";
}

function toAcquisitionMode(
  preset: PresentationPolicy["visualPreset"],
): "generate" | "retrieve" | "auto" {
  if (preset === "visual_heavy") {
    return "retrieve";
  }
  if (preset === "data_heavy") {
    return "generate";
  }
  return "auto";
}

function classifyError(message: string): RunnerErrorCategory {
  if (message.includes("PATH_OUTSIDE_WORKSPACE")) {
    return "policy_error";
  }
  if (message.includes("MODIFY_INPUT_ERROR")) {
    return "input_error";
  }
  if (message.includes("NLU_PARSE_ERROR")) {
    return "nlu_error";
  }
  if (message.toLowerCase().includes("validation")) {
    return "validation_error";
  }
  if (message.toLowerCase().includes("review")) {
    return "review_error";
  }
  if (message.toLowerCase().includes("export")) {
    return "export_error";
  }
  return "pipeline_error";
}

function stableHashFromOperations(operations: PresentationOperation[]): string {
  const serialized = stableStringify(operations);
  let hash = 0;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (hash * 31 + serialized.charCodeAt(i)) | 0;
  }
  return `op_${Math.abs(hash).toString(16)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
