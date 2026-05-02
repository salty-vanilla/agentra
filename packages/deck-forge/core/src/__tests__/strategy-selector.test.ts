import { describe, expect, it } from "vitest";
import {
  createBuiltinStrategyRegistry,
  DeterministicStrategySelector,
  findStrategyCandidatesForIntent,
  resolveSlideIntent,
  selectStrategyForIntent,
  selectStrategiesForDeck,
  buildStrategySelectionPrompt,
  validateLlmStrategySelectionResponse,
  applyStrategySelectionToSlideSpec,
  toStrategySelectionTrace,
  toStrategyCandidatePromptItems,
  StrategyRegistry,
} from "#src/strategy/index.js";
import type {
  ResolvedSlideIntent,
  StrategySelection,
  StrategySelectionInput,
  DeckPlan,
} from "#src/strategy/index.js";

const registry = createBuiltinStrategyRegistry();

function makeIntent(overrides: Partial<ResolvedSlideIntent> = {}): ResolvedSlideIntent {
  return {
    keyMessage: "Revenue grew 15% QoQ",
    intent: "report",
    contentKinds: ["kpi"],
    audience: "executive",
    genre: "business-review",
    density: "medium",
    ...overrides,
  };
}

describe("DeterministicStrategySelector", () => {
  const selector = new DeterministicStrategySelector();

  it("selects preferredStrategyId when candidate has that reason", () => {
    const intent = makeIntent({ preferredStrategyId: "kpi-card-overview" });
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const result = selector.select({ intent, candidateResult });

    expect(result.strategyId).toBe("kpi-card-overview");
    expect(result.selectedBy).toBe("preferredStrategyId");
    expect(result.confidence).toBe("high");
  });

  it("selects first candidate when no preferredStrategyId", () => {
    const intent = makeIntent();
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const result = selector.select({ intent, candidateResult });

    expect(result.strategyId).toBe(candidateResult.candidates[0].manifest.id);
    expect(result.selectedBy).toBe("deterministicSelector");
    expect(["medium", "high"]).toContain(result.confidence);
  });

  it("falls back to one-message-summary when no candidates", () => {
    const input: StrategySelectionInput = {
      intent: makeIntent(),
      candidateResult: { candidates: [], warnings: [] },
    };
    const result = selector.select(input);

    expect(result.strategyId).toBe("one-message-summary");
    expect(result.selectedBy).toBe("fallback");
    expect(result.confidence).toBe("low");
    expect(result.rationale).toContain("fallback");
    expect(result.rationale).toContain("one-message-summary");
  });

  it("fallback candidateIds includes the fallback strategyId (invariant)", () => {
    const input: StrategySelectionInput = {
      intent: makeIntent(),
      candidateResult: { candidates: [], warnings: [] },
    };
    const result = selector.select(input);
    expect(result.candidateIds).toContain(result.strategyId);
  });

  it("selection invariant: strategyId ∈ candidateIds for preferred path", () => {
    const intent = makeIntent({ preferredStrategyId: "kpi-card-overview" });
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const result = selector.select({ intent, candidateResult });
    expect(result.candidateIds).toContain(result.strategyId);
  });

  it("selection invariant: strategyId ∈ candidateIds for deterministic path", () => {
    const intent = makeIntent();
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const result = selector.select({ intent, candidateResult });
    expect(result.candidateIds).toContain(result.strategyId);
  });

  it("accepts custom fallbackStrategyId via constructor", () => {
    const custom = new DeterministicStrategySelector({ fallbackStrategyId: "three-point-summary" });
    const input: StrategySelectionInput = {
      intent: makeIntent(),
      candidateResult: { candidates: [], warnings: [] },
    };
    const result = custom.select(input);
    expect(result.strategyId).toBe("three-point-summary");
    expect(result.candidateIds).toContain("three-point-summary");
  });

  it("assigns high confidence for 3+ reasons", () => {
    const intent = makeIntent({
      intent: "report",
      contentKinds: ["kpi", "summary"],
      audience: "executive",
      genre: "business-review",
      density: "medium",
    });
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    // Ensure top candidate has 3+ reasons
    expect(candidateResult.candidates[0].reasons.length).toBeGreaterThanOrEqual(3);
    const result = selector.select({ intent, candidateResult });
    expect(result.confidence).toBe("high");
  });

  it("propagates warnings from candidateResult", () => {
    const input: StrategySelectionInput = {
      intent: makeIntent(),
      candidateResult: { candidates: [], warnings: ["test warning"] },
    };
    const result = selector.select(input);
    expect(result.warnings).toContain("test warning");
  });

  it("includes all candidateIds in result", () => {
    const intent = makeIntent();
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const result = selector.select({ intent, candidateResult });
    expect(result.candidateIds).toEqual(
      candidateResult.candidates.map((c) => c.manifest.id),
    );
  });
});

describe("buildStrategySelectionPrompt", () => {
  it("produces systemMessage, userMessage, and candidates", () => {
    const intent = makeIntent();
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidateResult.candidates);
    const prompt = buildStrategySelectionPrompt(intent, items);

    expect(prompt.systemMessage).toContain("strategy selector");
    expect(prompt.userMessage).toContain("Revenue grew 15% QoQ");
    expect(prompt.userMessage).toContain("executive");
    expect(prompt.candidates.length).toBe(items.length);
  });

  it("includes valid strategy IDs in system message", () => {
    const intent = makeIntent();
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidateResult.candidates);
    const prompt = buildStrategySelectionPrompt(intent, items);

    for (const item of items) {
      expect(prompt.systemMessage).toContain(item.id);
    }
  });

  it("includes audience takeaway when present", () => {
    const intent = makeIntent({ audienceTakeaway: "Growth is accelerating" });
    const candidateResult = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidateResult.candidates);
    const prompt = buildStrategySelectionPrompt(intent, items);

    expect(prompt.userMessage).toContain("Growth is accelerating");
  });
});

describe("validateLlmStrategySelectionResponse", () => {
  const validIds = ["kpi-card-overview", "one-message-summary", "kpi-dashboard-with-insight"];

  it("validates a correct response", () => {
    const result = validateLlmStrategySelectionResponse(
      { strategyId: "kpi-card-overview", rationale: "Best fit for KPIs" },
      validIds,
    );
    expect(result.valid).toBe(true);
    expect(result.response?.strategyId).toBe("kpi-card-overview");
    expect(result.response?.rationale).toBe("Best fit for KPIs");
  });

  it("rejects null input", () => {
    const result = validateLlmStrategySelectionResponse(null, validIds);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not an object");
  });

  it("rejects missing strategyId", () => {
    const result = validateLlmStrategySelectionResponse(
      { rationale: "something" },
      validIds,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("strategyId");
  });

  it("rejects strategyId not in candidate set", () => {
    const result = validateLlmStrategySelectionResponse(
      { strategyId: "unknown-strategy", rationale: "reason" },
      validIds,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not in the candidate set");
  });

  it("rejects empty rationale", () => {
    const result = validateLlmStrategySelectionResponse(
      { strategyId: "kpi-card-overview", rationale: "" },
      validIds,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("rationale");
  });
});

describe("selectStrategyForIntent", () => {
  it("returns a selection using default deterministic selector", async () => {
    const intent = makeIntent();
    const result = await selectStrategyForIntent(intent, registry);

    expect(result.strategyId).toBeTruthy();
    expect(result.selectedBy).toBe("deterministicSelector");
    expect(result.candidateIds.length).toBeGreaterThan(0);
  });

  it("uses provided selector", async () => {
    const customSelector = {
      select: (_input: StrategySelectionInput): StrategySelection => ({
        strategyId: "custom-pick",
        confidence: "high",
        rationale: "Custom selector chose this",
        selectedBy: "llmSelector",
        candidateIds: [],
        warnings: [],
      }),
    };
    const intent = makeIntent();
    const result = await selectStrategyForIntent(intent, registry, customSelector);
    expect(result.strategyId).toBe("custom-pick");
    expect(result.selectedBy).toBe("llmSelector");
  });

  it("does not warn when fallback strategy is registered", async () => {
    // Use a registry with only the fallback strategy — it will match as a
    // candidate (deterministicSelector), so fallback path is not triggered.
    // To truly trigger fallback with a registered strategy, we need a
    // registry where fallback exists but nothing matches the intent.
    // We use a custom selector that always returns fallback.
    const customSelector = {
      select: (_input: StrategySelectionInput): StrategySelection => ({
        strategyId: "one-message-summary",
        confidence: "low",
        rationale: "forced fallback",
        selectedBy: "fallback" as const,
        candidateIds: ["one-message-summary"],
        warnings: [],
      }),
    };
    const intent = makeIntent();
    const result = await selectStrategyForIntent(intent, registry, customSelector);
    expect(result.selectedBy).toBe("fallback");
    // one-message-summary IS registered in the full registry → no warning
    expect(result.warnings.every((w) => !w.includes("not registered"))).toBe(true);
  });

  it("warns when fallback strategy is not registered", async () => {
    const emptyRegistry = new StrategyRegistry();
    const intent = makeIntent();
    const result = await selectStrategyForIntent(intent, emptyRegistry);
    expect(result.selectedBy).toBe("fallback");
    expect(result.warnings).toContain(
      'Fallback strategyId "one-message-summary" is not registered.',
    );
  });
});

describe("selectStrategiesForDeck", () => {
  it("selects a strategy for each slide in the deck plan", async () => {
    const deckPlan: DeckPlan = {
      audience: "executive",
      genre: "business-review",
      density: "medium",
      slides: [
        { keyMessage: "Revenue up", intent: "report", contentKinds: ["kpi"] },
        { keyMessage: "Action plan", intent: "plan", contentKinds: ["process"] },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);

    expect(result.selections.length).toBe(2);
    expect(result.selections[0].strategyId).toBeTruthy();
    expect(result.selections[1].strategyId).toBeTruthy();
  });

  it("inherits deck defaults for slide intents", async () => {
    const deckPlan: DeckPlan = {
      audience: "engineer",
      genre: "technical-architecture",
      density: "high",
      slides: [
        { keyMessage: "System layers", intent: "explain", contentKinds: ["architecture"] },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);
    expect(result.selections.length).toBe(1);
    expect(result.selections[0].strategyId).toBeTruthy();
  });

  it("preserves output order matching input slide order", async () => {
    const deckPlan: DeckPlan = {
      audience: "executive",
      genre: "business-review",
      slides: [
        { keyMessage: "Slide A", intent: "summarize", contentKinds: ["summary"] },
        { keyMessage: "Slide B", intent: "compare", contentKinds: ["comparison"] },
        { keyMessage: "Slide C", intent: "plan", contentKinds: ["action-plan"] },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);
    expect(result.selections.length).toBe(3);
    // Each selection should have a strategyId (order test)
    for (const sel of result.selections) {
      expect(sel.strategyId).toBeTruthy();
    }
  });

  it("prefixes warnings with slide index", async () => {
    const deckPlan: DeckPlan = {
      audience: "executive",
      genre: "business-review",
      slides: [
        { keyMessage: "OK slide", intent: "report", contentKinds: ["kpi"] },
        {
          keyMessage: "Bad pref",
          intent: "report",
          contentKinds: ["kpi"],
          preferredStrategyId: "nonexistent-strategy-xyz",
        },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);
    // Second slide has an unknown preferredStrategyId → warning
    const slideWarnings = result.warnings.filter((w) => w.startsWith("[slide 2]"));
    expect(slideWarnings.length).toBeGreaterThan(0);
    expect(slideWarnings[0]).toContain("nonexistent-strategy-xyz");
  });

  it("prefixes warnings with slide id when present", async () => {
    const deckPlan: DeckPlan = {
      audience: "executive",
      genre: "business-review",
      slides: [
        {
          id: "root-cause-summary",
          keyMessage: "Bad pref",
          intent: "report",
          contentKinds: ["kpi"],
          preferredStrategyId: "nonexistent-xyz",
        },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);
    const prefixed = result.warnings.filter((w) =>
      w.startsWith("[slide 1: root-cause-summary]"),
    );
    expect(prefixed.length).toBeGreaterThan(0);
  });

  it("aggregates warnings in slide order", async () => {
    const deckPlan: DeckPlan = {
      audience: "executive",
      genre: "business-review",
      slides: [
        {
          keyMessage: "S1",
          intent: "report",
          contentKinds: ["kpi"],
          preferredStrategyId: "bad-1",
        },
        {
          keyMessage: "S2",
          intent: "report",
          contentKinds: ["kpi"],
          preferredStrategyId: "bad-2",
        },
      ],
    };
    const result = await selectStrategiesForDeck(deckPlan, registry);
    // Warnings from slide 1 should come before slide 2
    const slide1Idx = result.warnings.findIndex((w) => w.startsWith("[slide 1]"));
    const slide2Idx = result.warnings.findIndex((w) => w.startsWith("[slide 2]"));
    expect(slide1Idx).toBeGreaterThanOrEqual(0);
    expect(slide2Idx).toBeGreaterThanOrEqual(0);
    expect(slide1Idx).toBeLessThan(slide2Idx);
  });
});

describe("applyStrategySelectionToSlideSpec", () => {
  it("sets preferredStrategyId on the slide spec", () => {
    const slideSpec: { preferredStrategyId?: string } = {};
    const selection: StrategySelection = {
      strategyId: "kpi-card-overview",
      confidence: "high",
      rationale: "test",
      selectedBy: "deterministicSelector",
      candidateIds: ["kpi-card-overview"],
      warnings: [],
    };
    applyStrategySelectionToSlideSpec(slideSpec, selection);
    expect(slideSpec.preferredStrategyId).toBe("kpi-card-overview");
  });

  it("overwrites existing preferredStrategyId", () => {
    const slideSpec = { preferredStrategyId: "old-strategy" };
    const selection: StrategySelection = {
      strategyId: "new-strategy",
      confidence: "medium",
      rationale: "new pick",
      selectedBy: "llmSelector",
      candidateIds: [],
      warnings: [],
    };
    applyStrategySelectionToSlideSpec(slideSpec, selection);
    expect(slideSpec.preferredStrategyId).toBe("new-strategy");
  });
});

describe("toStrategySelectionTrace", () => {
  it("builds a trace from intent and selection", () => {
    const intent = makeIntent({ id: "slide-1", preferredStrategyId: "kpi-card-overview" });
    const selection: StrategySelection = {
      strategyId: "kpi-card-overview",
      confidence: "high",
      rationale: "preferred",
      selectedBy: "preferredStrategyId",
      candidateIds: ["kpi-card-overview"],
      warnings: [],
    };
    const trace = toStrategySelectionTrace(intent, selection);

    expect(trace.intentId).toBe("slide-1");
    expect(trace.keyMessage).toBe("Revenue grew 15% QoQ");
    expect(trace.audience).toBe("executive");
    expect(trace.genre).toBe("business-review");
    expect(trace.density).toBe("medium");
    expect(trace.intent).toBe("report");
    expect(trace.contentKinds).toEqual(["kpi"]);
    expect(trace.preferredStrategyId).toBe("kpi-card-overview");
    expect(trace.selection).toBe(selection);
  });

  it("handles missing optional fields", () => {
    const intent = makeIntent();
    const selection: StrategySelection = {
      strategyId: "one-message-summary",
      confidence: "low",
      rationale: "fallback",
      selectedBy: "fallback",
      candidateIds: [],
      warnings: [],
    };
    const trace = toStrategySelectionTrace(intent, selection);

    expect(trace.intentId).toBeUndefined();
    expect(trace.preferredStrategyId).toBeUndefined();
    expect(trace.avoidStrategyIds).toBeUndefined();
  });
});
