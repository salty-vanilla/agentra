import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DeckPlan, PresentationBrief, PresentationIR, SlideSpec } from "@deck-forge/core";
import { describe, expect, it } from "vitest";

import { DeckForgeRunner } from "#src/runner.js";
import type { DeckForgeRunInput, DeckForgeRunnerOptions } from "#src/runner.js";

const RUNNER_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type RevisionLoopCapableRunner = {
  runRevisionLoop(input: {
    presentation: PresentationIR;
    payload: DeckForgeRunInput;
    grounding?: {
      language?: string;
      requestedSlideCount?: number;
      mustInclude?: string[];
      mustAvoid?: string[];
    };
    validationLevel: "basic" | "strict" | "export";
    shouldAutoFix: boolean;
    revisionPolicy: "none" | "validation_only" | "ai_review";
    reviewTrigger?: "errors" | "warnings" | "always";
    maxRevisionLoops: number;
    trace: unknown[];
  }): Promise<{
    presentation: PresentationIR;
    report: {
      status: string;
      summary: {
        errorCount: number;
        warningCount: number;
      };
    };
    summary: {
      policy: "none" | "validation_only" | "ai_review";
      loopsExecuted: number;
      operationsApplied: number;
      trace: Array<{
        issueCount: number;
        operationCount: number;
        operationHash?: string;
        stopReason?: string;
      }>;
      deterministicRepair?: {
        enabled: boolean;
        skippedReason?: string;
        issueCountBefore: number;
        issueCountAfter: number;
        proposedCount: number;
        appliedCount: number;
        skippedCount: number;
        remainingIssueIds: string[];
      };
    };
  }>;
};

describe("DeckForgeRunner", () => {
  it("exports only the runner public API from the package entrypoint", async () => {
    const mod = await import("#src/index.js");

    expect(Object.keys(mod)).toEqual(["DeckForgeRunner"]);
  });

  it("does not depend on Strands, AWS, AgentCore, or adapters", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(RUNNER_PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const dependencyNames = Object.keys(packageJson.dependencies ?? {});

    expect(dependencyNames).toEqual(["@deck-forge/core", "@deck-forge/tools"]);

    const source = fs.readFileSync(
      path.join(RUNNER_PACKAGE_ROOT, "src/runner.ts"),
      "utf8",
    );
    expect(source).not.toContain("@deck-forge/adapters");
    expect(source).not.toContain("@strands-agents/sdk");
    expect(source).not.toContain("AgentCore");
    expect(source).not.toContain("aws-sdk");
  });

  it("runs create workflow from agent-provided artifacts", async () => {
    const createArtifacts = createAgentArtifacts({
      title: "Factory modernization proposal",
      slideCount: 5,
      language: "en",
      requiredText: "Approve AI modernization plan",
    });
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          audience: "manufacturing executives",
          goal: "Approve AI modernization plan",
          slideCount: 5,
          tone: "executive",
          createArtifacts,
          grounding: {
            language: "en",
            requestedSlideCount: 5,
            mustInclude: ["Approve AI modernization plan"],
          },
          confidence: 0.95,
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });
    const result = await agent.run({
      goal: "Factory modernization proposal",
      mode: "create",
      includeTrace: true,
      exportFormat: "json",
    });

    expect(result.finalStatus).toBe("success");
    expect(result.mode).toBe("create");
    expect(result.appliedPolicy).toBeDefined();
    expect(result.artifacts.presentation).toBeDefined();
    expect(result.artifacts.structuredIntent).toBeDefined();
    expect(result.validationReport).toBeDefined();
    expect(result.exportResult).toBeDefined();
    expect(result.errors).toHaveLength(0);
    expect(result.trace?.some((item) => item.step === "validate_agent_artifacts")).toBe(true);
    expect(result.trace?.some((item) => item.step === "export")).toBe(true);
    expect(result.revision?.policy).toBe("validation_only");
  });

  it("fails create mode when the agent does not provide create artifacts", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          confidence: 0.95,
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });

    const result = await agent.run({
      goal: "Factory modernization proposal",
      mode: "create",
      exportFormat: "json",
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.errors[0]?.category).toBe("nlu_error");
    expect(result.errors[0]?.message).toContain("createArtifacts");
  });

  it("passes requested image provider into retrieved asset planning", async () => {
    const createArtifacts = createAgentArtifacts({
      title: "Tokyo event guide",
      slideCount: 5,
      language: "en",
      requiredText: "Tokyo event guide",
      visualSlide: true,
    });
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          goal: "Tokyo event guide",
          slideCount: 5,
          createArtifacts,
          grounding: {
            language: "en",
            requestedSlideCount: 5,
            mustInclude: ["Tokyo event guide"],
          },
          confidence: 0.95,
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });

    const result = await agent.run({
      goal: "Tokyo event guide",
      mode: "create",
      acquisitionMode: "retrieve",
      imageProvider: "pexels",
      exportFormat: "json",
    });

    const assetSpecs = result.artifacts.assetSpecs as Array<{ provider?: string }>;
    expect(result.finalStatus).toBe("success");
    expect(assetSpecs.some((asset) => asset.provider === "pexels")).toBe(true);
  });

  it("fails agent artifacts that omit required user-supplied content", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          confidence: 0.95,
          createArtifacts: createAgentArtifacts({
            title: "Tokyo event guide",
            slideCount: 3,
            language: "ja",
            requiredText: "別の内容",
          }),
          grounding: {
            language: "ja",
            requestedSlideCount: 3,
            mustInclude: ["日本国憲法原本 特別展示"],
          },
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });

    const result = await agent.run({
      goal: "日本国憲法原本 特別展示について資料を作成してください",
      mode: "create",
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.errors[0]?.category).toBe("validation_error");
    expect(result.errors[0]?.message).toContain("missing required user-supplied content");
  });

  it("fails agent artifacts that contain generic filler", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          confidence: 0.95,
          createArtifacts: createAgentArtifacts({
            title: "Factory modernization proposal",
            slideCount: 3,
            language: "en",
            requiredText: "Evidence and context supporting this message",
          }),
          grounding: {
            language: "en",
            requestedSlideCount: 3,
          },
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });

    const result = await agent.run({
      goal: "Factory modernization proposal",
      mode: "create",
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.errors[0]?.category).toBe("validation_error");
    expect(result.errors[0]?.message).toContain("generic filler");
  });

  it("fails modify mode when parser confidence is low", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          confidence: 0.95,
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.5,
          missingFields: ["operations"],
        }),
      },
    });
    const presentation = {
      id: "deck-1",
      version: "1.0.0",
      meta: {
        title: "t",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      theme: {
        id: "theme-1",
        name: "Default",
        colors: {
          background: "#FFFFFF",
          surface: "#F8FAFC",
          textPrimary: "#0F172A",
          textSecondary: "#475569",
          primary: "#1D4ED8",
          secondary: "#0EA5E9",
          accent: "#14B8A6",
          chartPalette: ["#1D4ED8"],
        },
        typography: {
          fontFamily: { heading: "Arial", body: "Arial" },
          fontSize: { title: 36, heading: 28, body: 18, caption: 14, footnote: 12 },
          lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.8 },
          weight: { regular: 400, medium: 500, bold: 700 },
        },
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
        radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
        slideDefaults: { backgroundColor: "#FFFFFF", padding: 24 },
        elementDefaults: { text: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" } },
      },
      slides: [],
      assets: { assets: [] },
      operationLog: [],
    };
    const result = await agent.run({
      goal: "Update slide 2",
      mode: "modify",
      presentation,
      includeTrace: true,
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.appliedPolicy).toBeDefined();
    expect(result.errors[0]?.category).toBe("nlu_error");
    expect(result.errors[0]?.message).toContain("NLU_PARSE_ERROR");
  });

  it("supports validation_only policy without reviewer/planner", async () => {
    const createArtifacts = createAgentArtifacts({
      title: "Simple request",
      slideCount: 3,
      language: "en",
      requiredText: "Simple request",
    });
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 1,
      intentParser: {
        parseCreate: async () => ({
          mode: "create",
          confidence: 0.95,
          audience: "ops",
          goal: "test",
          slideCount: 3,
          createArtifacts,
          grounding: {
            requestedSlideCount: 3,
            mustInclude: ["Simple request"],
          },
        }),
        parseModify: async () => ({
          mode: "modify",
          confidence: 0.95,
          modifyIntent: { changeRequest: "none", operations: [] },
        }),
      },
    });

    const result = await agent.run({
      goal: "Simple request",
      mode: "create",
      exportFormat: "json",
    });

    expect(result.finalStatus).toBe("success");
    expect(result.revision?.policy).toBe("validation_only");
    expect(Array.isArray(result.revision?.trace)).toBe(true);
  });

  it("fails fast when ai_review policy is configured without reviewer/planner", () => {
    expect(
      () =>
        new DeckForgeRunner({
          runtime: {} as never,
          revisionPolicy: "ai_review",
          intentParser: {
            parseCreate: async () => ({ mode: "create", confidence: 0.95 }),
            parseModify: async () => ({ mode: "modify", confidence: 0.95 }),
          },
        }),
    ).toThrow("REVIEWER_ERROR");
  });

  it("caps maxRevisionLoops at 5", async () => {
    const agent = createAiReviewRunner({
      maxRevisionLoops: 99,
      reviewer: {
        review: async () => [
          { code: "still_invalid", severity: "error", message: "Deck remains invalid." },
        ],
      },
      operationPlanner: {
        plan: async () => [],
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createEmptyPresentation(),
      payload: { goal: "Fix deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: getResolvedMaxRevisionLoops(agent),
      trace: [],
    });

    expect(result.summary.loopsExecuted).toBe(1);
    expect(getResolvedMaxRevisionLoops(agent)).toBe(5);
    expect(result.summary.trace[0]?.stopReason).toBe("no_planned_operations");
  });

  it("passes validation report into ai reviewer", async () => {
    let receivedErrorCount = -1;
    const agent = createAiReviewRunner({
      reviewer: {
        review: async ({ report }) => {
          receivedErrorCount = report?.summary.errorCount ?? -1;
          return [];
        },
      },
      operationPlanner: {
        plan: async () => [],
      },
    });

    await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createEmptyPresentation(),
      payload: { goal: "Fix deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 2,
      trace: [],
    });

    expect(receivedErrorCount).toBeGreaterThan(0);
  });

  it("passes review packet into ai reviewer", async () => {
    let receivedPacket: unknown;
    const agent = createAiReviewRunner({
      reviewer: {
        review: async ({ packet }) => {
          receivedPacket = packet;
          return [];
        },
      },
      operationPlanner: {
        plan: async () => [],
      },
    });

    await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createEmptyPresentation(),
      payload: { goal: "日本語の入力を確認する" },
      grounding: { language: "ja", requestedSlideCount: 3 },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 1,
      trace: [],
    });

    const packet = receivedPacket as {
      userRequest?: string;
      grounding?: { language?: string; requestedSlideCount?: number };
      validationReport?: { status?: string };
      inspect?: { deck?: { slideCount?: number } };
    };
    expect(packet.userRequest).toBe("日本語の入力を確認する");
    expect(packet.grounding?.language).toBe("ja");
    expect(packet.grounding?.requestedSlideCount).toBe(3);
    expect(packet.validationReport?.status).toBe("failed");
    expect(packet.inspect?.deck?.slideCount).toBe(0);
  });

  it("runs ai_review for warning-only reports when reviewTrigger is warnings", async () => {
    let reviewCalls = 0;
    const agent = createAiReviewRunner({
      reviewTrigger: "warnings",
      reviewer: {
        review: async ({ report }) => {
          reviewCalls += 1;
          expect(report?.summary.errorCount).toBe(0);
          expect(report?.summary.warningCount).toBeGreaterThan(0);
          return [];
        },
      },
      operationPlanner: {
        plan: async () => [],
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createWarningOnlyPresentation(),
      payload: { goal: "Review warning-only deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      reviewTrigger: "warnings",
      maxRevisionLoops: 1,
      trace: [],
    });

    expect(reviewCalls).toBe(1);
    expect(result.summary.trace[0]?.stopReason).toBe("no_review_issues");
  });

  it("does not run ai_review for warning-only reports by default", async () => {
    let reviewCalls = 0;
    const agent = createAiReviewRunner({
      reviewer: {
        review: async () => {
          reviewCalls += 1;
          return [];
        },
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createWarningOnlyPresentation(),
      payload: { goal: "Review warning-only deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 1,
      trace: [],
    });

    expect(reviewCalls).toBe(0);
    expect(result.summary.loopsExecuted).toBe(0);
    expect(result.report.status).toBe("warning");
  });

  it("stops ai_review when planner returns no operations", async () => {
    const agent = createAiReviewRunner({
      reviewer: {
        review: async () => [
          { code: "still_invalid", severity: "error", message: "Deck remains invalid." },
        ],
      },
      operationPlanner: {
        plan: async () => [],
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createEmptyPresentation(),
      payload: { goal: "Fix deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 2,
      trace: [],
    });

    expect(result.summary.trace[0]?.stopReason).toBe("no_planned_operations");
  });

  it("stops ai_review when validation does not improve", async () => {
    const agent = createAiReviewRunner({
      reviewer: {
        review: async () => [
          { code: "still_invalid", severity: "error", message: "Deck remains invalid." },
        ],
      },
      operationPlanner: {
        plan: async () => [
          {
            type: "add_text",
            slideId: "slide-1",
            role: "body",
            text: "Additional context",
          },
        ],
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createInvalidPresentationWithImageAndChart(),
      payload: { goal: "Fix deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 2,
      trace: [],
    });

    expect(result.summary.trace[0]?.stopReason).toBe("no_issue_or_validation_improvement");
  });

  it("stops ai_review when operation hash repeats", async () => {
    const repeatedOperations = [
      {
        type: "add_slide" as const,
        slideId: "slide-1",
        title: "Inserted",
        intent: {
          type: "proposal" as const,
          keyMessage: "Inserted slide addresses the missing deck structure.",
          audienceTakeaway: "The deck has a concrete starting point.",
        },
        layout: { type: "single_column" as const, density: "medium" as const },
      },
      {
        type: "add_text" as const,
        slideId: "slide-1",
        elementId: "el-1",
        role: "body" as const,
        text: "Inserted slide content that clears the empty-slide gate.",
      },
    ];
    const agent = createAiReviewRunner({
      reviewer: {
        review: async () => [
          { code: "asset_missing", severity: "error", message: "Asset is missing." },
          { code: "chart_empty", severity: "error", message: "Chart is empty." },
        ],
      },
      operationPlanner: {
        plan: async () => repeatedOperations,
      },
    });

    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createEmptyPresentationWithDanglingAsset(),
      payload: { goal: "Fix deck" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 3,
      trace: [],
    });

    expect(result.summary.trace.at(-1)?.stopReason).toBe("repeated_operations");
    expect(result.summary.trace.at(-1)?.operationHash).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Phase 4b: Deterministic repair integration
  // -----------------------------------------------------------------------

  it("does not run deterministic repair when disabled (default)", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
    });

    const trace: unknown[] = [];
    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createPresentationWithOobElement(),
      payload: { goal: "Test disabled repair" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
      trace,
    });

    // No deterministicRepair summary when disabled
    expect(result.summary.deterministicRepair).toBeUndefined();
    // No deterministic_repair trace entry
    const repairTraces = (trace as Array<{ step: string }>).filter(
      (t) => t.step === "deterministic_repair",
    );
    expect(repairTraces).toHaveLength(0);
  });

  it("runs deterministic repair when enabled with layout issues", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
      enableDeterministicRepair: true,
    });

    const pres = createPresentationWithOobElement();
    const trace: unknown[] = [];
    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: pres,
      payload: { goal: "Test enabled repair" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
      trace,
    });

    const repairSummary = result.summary.deterministicRepair;
    expect(repairSummary).toBeDefined();
    expect(repairSummary!.enabled).toBe(true);
    expect(repairSummary!.appliedCount).toBeGreaterThan(0);
    expect(repairSummary!.issueCountAfter).toBeLessThanOrEqual(repairSummary!.issueCountBefore);
    expect(repairSummary!.skippedReason).toBeUndefined();

    // Trace should include deterministic_repair step
    const repairTraces = (trace as Array<{ step: string; status: string }>).filter(
      (t) => t.step === "deterministic_repair",
    );
    expect(repairTraces).toHaveLength(1);
    expect(repairTraces[0]!.status).toBe("success");

    // Repaired element should be clamped to slide bounds
    const repairedEl = result.presentation.slides[0]!.elements.find(
      (e: { id: string }) => e.id === "el-oob",
    ) as { frame: { x: number; y: number } };
    expect(repairedEl.frame.x).toBeGreaterThanOrEqual(0);
    expect(repairedEl.frame.y).toBeGreaterThanOrEqual(0);
  });

  it("skips repair when enabled but no repairable layout issues exist", async () => {
    const agent = new DeckForgeRunner({
      runtime: {} as never,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
      enableDeterministicRepair: true,
    });

    const trace: unknown[] = [];
    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createWarningOnlyPresentation(),
      payload: { goal: "Test no layout issues" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "validation_only",
      maxRevisionLoops: 0,
      trace,
    });

    const repairSummary = result.summary.deterministicRepair;
    expect(repairSummary).toBeDefined();
    expect(repairSummary!.enabled).toBe(true);
    expect(repairSummary!.skippedReason).toBe("no_layout_issues");
    expect(repairSummary!.appliedCount).toBe(0);
    expect(repairSummary!.proposedCount).toBe(0);

    // No deterministic_repair trace entry for no-op
    const repairTraces = (trace as Array<{ step: string }>).filter(
      (t) => t.step === "deterministic_repair",
    );
    expect(repairTraces).toHaveLength(0);
  });

  it("does not enable deterministic repair by default for ai_review", async () => {
    const agent = createAiReviewRunner({
      reviewer: {
        review: async () => [],
      },
      operationPlanner: {
        plan: async () => [],
      },
      // Note: enableDeterministicRepair is NOT set
    });

    const trace: unknown[] = [];
    const result = await (agent as unknown as RevisionLoopCapableRunner).runRevisionLoop({
      presentation: createPresentationWithOobElement(),
      payload: { goal: "Test ai_review default" },
      validationLevel: "basic",
      shouldAutoFix: false,
      revisionPolicy: "ai_review",
      maxRevisionLoops: 1,
      trace,
    });

    // Deterministic repair should not run by default
    expect(result.summary.deterministicRepair).toBeUndefined();
    const repairTraces = (trace as Array<{ step: string }>).filter(
      (t) => t.step === "deterministic_repair",
    );
    expect(repairTraces).toHaveLength(0);
  });
});

function createAiReviewRunner(options: Partial<DeckForgeRunnerOptions>): DeckForgeRunner {
  return new DeckForgeRunner({
    runtime: {} as never,
    revisionPolicy: "ai_review",
    intentParser: {
      parseCreate: async () => ({ mode: "create", confidence: 0.95 }),
      parseModify: async () => ({ mode: "modify", confidence: 0.95 }),
    },
    reviewer: {
      review: async () => [],
    },
    operationPlanner: {
      plan: async () => [],
    },
    ...options,
  });
}

function createAgentArtifacts(input: {
  title: string;
  slideCount: number;
  language: string;
  requiredText: string;
  visualSlide?: boolean;
}): { brief: PresentationBrief; deckPlan: DeckPlan; slideSpecs: SlideSpec[] } {
  const brief: PresentationBrief = {
    id: `brief-${input.title.toLowerCase().replaceAll(/\s+/g, "-")}`,
    title: input.title,
    audience: {
      primary: "stakeholders",
      expertiseLevel: "intermediate",
    },
    goal: {
      type: "inform",
      mainMessage: input.requiredText,
      desiredOutcome: "Audience understands the supplied content.",
    },
    tone: {
      formality: "business",
      energy: "confident",
      technicalDepth: "medium",
      styleKeywords: ["clear", "grounded"],
    },
    narrative: {
      structure: "analysis",
      arc: [{ role: "hook", message: input.requiredText }],
    },
    output: {
      formats: ["json"],
      aspectRatio: "16:9",
      language: input.language,
    },
    constraints: {
      slideCount: input.slideCount,
      minSlideCount: input.slideCount,
      maxSlideCount: input.slideCount,
    },
    visualDirection: {
      style: "corporate",
      mood: "trustworthy",
    },
  };

  const slidePlans = Array.from({ length: input.slideCount }, (_, index) => {
    const slideNumber = index + 1;
    const id = `slide-${slideNumber}`;
    return {
      id,
      title: `${input.title} ${slideNumber}`,
      intent: {
        type: slideNumber === 1 ? ("title" as const) : ("summary" as const),
        keyMessage: input.requiredText,
        audienceTakeaway: "The supplied content is represented in the deck.",
      },
      expectedLayout:
        input.visualSlide && slideNumber === 2 ? ("hero" as const) : ("single_column" as const),
      contentRequirements: [
        {
          id: `${id}-body`,
          description: "Use the agent supplied source content.",
          priority: "high" as const,
          expectedBlockType: "bullet_list" as const,
        },
      ],
    };
  });

  const deckPlan: DeckPlan = {
    id: `deck-${input.title.toLowerCase().replaceAll(/\s+/g, "-")}`,
    briefId: brief.id,
    title: input.title,
    slideCountTarget: input.slideCount,
    sections: [
      {
        id: "section-main",
        title: "Main",
        role: "analysis",
        slides: slidePlans,
      },
    ],
    globalStoryline: input.requiredText,
  };

  const slideSpecs: SlideSpec[] = slidePlans.map((plan, index) => ({
    id: plan.id,
    slideNumber: index + 1,
    title: plan.title,
    intent: plan.intent,
    layout:
      input.visualSlide && index === 1
        ? { type: "hero", density: "low", emphasis: "visual" }
        : { type: index === 0 ? "title" : "single_column", density: "medium", emphasis: "top" },
    content: [
      {
        id: `cb-${plan.id}-title`,
        type: "title",
        text: plan.title,
      },
      {
        id: `cb-${plan.id}-body`,
        type: "bullet_list",
        density: "medium",
        items: [{ text: input.requiredText, importance: "high" }],
      },
    ],
  }));

  return { brief, deckPlan, slideSpecs };
}

function getResolvedMaxRevisionLoops(agent: DeckForgeRunner): number {
  const options = (agent as unknown as { options: DeckForgeRunnerOptions }).options;
  return Math.min(5, Math.max(0, options.maxRevisionLoops ?? 2));
}

function createEmptyPresentation(): PresentationIR {
  return {
    ...createBasePresentation(),
    slides: [],
  };
}

function createEmptyPresentationWithDanglingAsset(): PresentationIR {
  return {
    ...createEmptyPresentation(),
    assets: {
      assets: [
        {
          id: "asset-dangling",
          type: "image",
          uri: "",
          mimeType: "image/png",
          metadata: {
            source: "generated",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          usage: [{ slideId: "missing-slide", elementId: "missing-element", role: "hero" }],
        },
      ],
    },
  };
}

function createWarningOnlyPresentation(): PresentationIR {
  return {
    ...createBasePresentation(),
    slides: [
      {
        id: "slide-warning",
        index: 0,
        title: "Warning-only slide",
        intent: {
          type: "summary",
          keyMessage: "Deck has a warning but no blocking validation error.",
          audienceTakeaway: "A reviewer can improve presentation quality.",
        },
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [],
        },
        elements: [
          {
            id: "body-1",
            type: "text",
            role: "body",
            text: {
              paragraphs: [
                {
                  runs: [{ text: "This slide has body content but no title text element." }],
                },
              ],
            },
            frame: { x: 80, y: 120, width: 900, height: 180 },
            style: {
              fontFamily: "Arial",
              fontSize: 24,
              color: "#0F172A",
            },
          },
        ],
      },
    ],
  };
}

function createInvalidPresentationWithImageAndChart(): PresentationIR {
  return {
    ...createBasePresentation(),
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Invalid slide",
        intent: {
          type: "data_insight",
          keyMessage: "Show validation failures",
          audienceTakeaway: "Needs fixing",
        },
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [],
        },
        elements: [
          {
            id: "image-1",
            type: "image",
            assetId: "missing-asset",
            role: "hero",
            frame: { x: 40, y: 40, width: 400, height: 240 },
          },
          {
            id: "chart-1",
            type: "chart",
            frame: { x: 40, y: 320, width: 400, height: 240 },
            chartType: "bar",
            data: { series: [] },
            encoding: { x: "category", y: "value" },
          },
        ],
      },
    ],
  };
}

function createBasePresentation(): PresentationIR {
  return {
    id: "deck-1",
    version: "1.0.0",
    meta: {
      title: "Deck",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    theme: {
      id: "theme-1",
      name: "Default",
      colors: {
        background: "#FFFFFF",
        surface: "#F8FAFC",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        primary: "#1D4ED8",
        secondary: "#0EA5E9",
        accent: "#14B8A6",
        chartPalette: ["#1D4ED8"],
      },
      typography: {
        fontFamily: { heading: "Arial", body: "Arial" },
        fontSize: { title: 36, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.8 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
      radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
      slideDefaults: { backgroundColor: "#FFFFFF", padding: 24 },
      elementDefaults: { text: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" } },
    },
    slides: [],
    assets: { assets: [] },
    operationLog: [],
  };
}

function createPresentationWithOobElement(): PresentationIR {
  return {
    ...createBasePresentation(),
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide with OOB element",
        intent: {
          type: "summary",
          keyMessage: "Test deterministic repair",
          audienceTakeaway: "Layout should be repaired",
        },
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [],
        },
        elements: [
          {
            id: "el-title",
            type: "text",
            role: "title",
            text: {
              paragraphs: [{ runs: [{ text: "Test Title" }] }],
            },
            frame: { x: 80, y: 80, width: 1120, height: 100 },
            style: { fontFamily: "Arial", fontSize: 36, color: "#0F172A" },
          },
          {
            id: "el-oob",
            type: "text",
            role: "body",
            text: {
              paragraphs: [{ runs: [{ text: "Out of bounds body text" }] }],
            },
            frame: { x: -100, y: -50, width: 400, height: 200 },
            style: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" },
          },
        ],
      },
    ],
  };
}
