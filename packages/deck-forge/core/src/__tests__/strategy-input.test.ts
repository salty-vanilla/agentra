import { describe, expect, it } from "vitest";
import {
  createBuiltinStrategyRegistry,
  STRATEGY_INPUT_SCHEMAS,
  validateStrategyInput,
  DeterministicStrategyInputGenerator,
  buildStrategyInputPrompt,
  validateLlmStrategyInputResponse,
  applyStrategyInputToSlideSpec,
} from "#src/strategy/index.js";
import type {
  ResolvedSlideIntent,
  StrategySelection,
} from "#src/strategy/index.js";

const registry = createBuiltinStrategyRegistry();
const allManifests = registry.listStrategyManifests();
const allIds = allManifests.map((m) => m.id);

function makeIntent(): ResolvedSlideIntent {
  return {
    keyMessage: "Revenue grew 15% QoQ",
    intent: "report",
    contentKinds: ["kpi"],
    audience: "executive",
    genre: "business-review",
    density: "medium",
  };
}

function makeSelection(strategyId: string): StrategySelection {
  return {
    strategyId,
    confidence: "high",
    rationale: "test",
    selectedBy: "deterministicSelector",
    candidateIds: [strategyId],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Schema coverage
// ---------------------------------------------------------------------------
describe("StrategyInput schema coverage", () => {
  it("every built-in manifest has an inputSchema", () => {
    for (const m of allManifests) {
      expect(m.inputSchema, `${m.id} missing inputSchema`).toBeDefined();
    }
  });

  it("STRATEGY_INPUT_SCHEMAS has exactly the same IDs as built-in manifests", () => {
    const schemaIds = Object.keys(STRATEGY_INPUT_SCHEMAS).sort();
    const manifestIds = allIds.slice().sort();
    expect(schemaIds).toEqual(manifestIds);
  });
});

// ---------------------------------------------------------------------------
// Schema validation for each strategy
// ---------------------------------------------------------------------------
describe("StrategyInput schema validation", () => {
  const validSamples: Record<string, unknown> = {
    "kpi-card-overview": {
      headline: "Q3 KPI overview",
      metrics: [{ label: "Revenue", value: "$1.2M" }],
    },
    "kpi-dashboard-with-insight": {
      headline: "Q3 dashboard",
      metrics: [{ label: "A", value: "1" }, { label: "B", value: "2" }],
      insight: { headline: "Growth accelerating" },
    },
    "decision-request": {
      headline: "Budget approval",
      decisionNeeded: "Approve Q4 budget",
    },
    "recommendation-comparison": {
      headline: "Vendor selection",
      recommendation: "Vendor A",
      options: [{ label: "Vendor A" }, { label: "Vendor B" }],
    },
    "action-plan-table": {
      headline: "Next steps",
      actions: [{ action: "Ship v2" }],
    },
    "process-flow-with-impact": {
      headline: "Manufacturing flow",
      steps: [{ label: "Step 1" }, { label: "Step 2" }],
    },
    "implementation-roadmap": {
      headline: "2024 Roadmap",
      milestones: [{ label: "Phase 1" }, { label: "Phase 2" }],
    },
    "layered-architecture": {
      headline: "System layers",
      layers: [
        { name: "UI", components: ["React"] },
        { name: "API", components: ["Express"] },
      ],
    },
    "data-insight-story": {
      headline: "Data finding",
      insight: { headline: "Churn spiked" },
    },
    "small-multiples-trend": {
      headline: "Regional trends",
      charts: [
        { title: "East", categories: ["Q1"], values: [10] },
        { title: "West", categories: ["Q1"], values: [20] },
      ],
    },
    "option-comparison-table": {
      headline: "Options",
      options: [{ label: "A" }, { label: "B" }],
      criteria: ["Cost", "Quality"],
    },
    "one-message-summary": {
      message: "We are on track.",
    },
    "three-point-summary": {
      headline: "Three pillars",
      points: [{ title: "P1" }, { title: "P2" }, { title: "P3" }],
    },
    "two-column-comparison": {
      headline: "Before vs After",
      left: { title: "Before", points: ["Slow"] },
      right: { title: "After", points: ["Fast"] },
    },
    "event-timeline": {
      headline: "Incident timeline",
      events: [{ label: "Alert" }, { label: "Resolution" }],
    },
    "metric-tile-dashboard": {
      headline: "Operations dashboard",
      tiles: [
        { label: "T1", value: "1" },
        { label: "T2", value: "2" },
        { label: "T3", value: "3" },
        { label: "T4", value: "4" },
      ],
    },
    "two-axis-matrix": {
      headline: "Priority matrix",
      xAxis: "Impact",
      yAxis: "Effort",
      items: [
        { label: "A", x: "high", y: "low" },
        { label: "B", x: "medium", y: "medium" },
        { label: "C", x: "low", y: "high" },
      ],
    },
  };

  for (const id of allIds) {
    it(`${id}: valid sample passes`, () => {
      const sample = validSamples[id];
      expect(sample, `No valid sample for ${id}`).toBeDefined();
      const result = validateStrategyInput({ strategyId: id, value: sample });
      expect(result.ok, `Validation failed for ${id}: ${result.errors.join("; ")}`).toBe(true);
    });

    it(`${id}: invalid sample fails`, () => {
      const result = validateStrategyInput({ strategyId: id, value: {} });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }

  it("unknown strategyId returns ok: false", () => {
    const result = validateStrategyInput({ strategyId: "nonexistent", value: {} });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("No input schema");
  });
});

// ---------------------------------------------------------------------------
// Deterministic generator
// ---------------------------------------------------------------------------
describe("DeterministicStrategyInputGenerator", () => {
  const generator = new DeterministicStrategyInputGenerator();

  for (const id of allIds) {
    it(`${id}: generates valid input`, () => {
      const intent = makeIntent();
      const selection = makeSelection(id);
      const result = generator.generate({ slideIntent: intent, selection });

      expect(result.strategyId).toBe(id);
      expect(["deterministic", "fallback"]).toContain(result.source);

      // Validate the generated input
      const validation = validateStrategyInput({ strategyId: id, value: result.input });
      if (result.source === "deterministic") {
        expect(validation.ok, `Generated input for ${id} doesn't validate: ${validation.errors.join("; ")}`).toBe(true);
      }
    });

    it(`${id}: no low-level rendering keys`, () => {
      const intent = makeIntent();
      const selection = makeSelection(id);
      const result = generator.generate({ slideIntent: intent, selection });
      const inputStr = JSON.stringify(result.input);
      // Check for rendering-specific keys (not semantic axis labels used by two-axis-matrix)
      const forbidden = ["\"width\":", "\"height\":", "\"fill\":", "\"stroke\":", "\"fontSize\":", "\"shape\":"];
      for (const key of forbidden) {
        expect(inputStr).not.toContain(key);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------
describe("buildStrategyInputPrompt", () => {
  it("is JSON serializable", () => {
    const manifest = registry.getStrategyManifest("kpi-card-overview")!;
    const prompt = buildStrategyInputPrompt({
      slideIntent: makeIntent(),
      selection: makeSelection("kpi-card-overview"),
      manifest,
    });
    expect(() => JSON.stringify(prompt)).not.toThrow();
  });

  it("includes selected strategy id", () => {
    const manifest = registry.getStrategyManifest("action-plan-table")!;
    const prompt = buildStrategyInputPrompt({
      slideIntent: makeIntent(),
      selection: makeSelection("action-plan-table"),
      manifest,
    });
    expect(prompt.selectedStrategy.id).toBe("action-plan-table");
  });

  it("includes inputSchema info", () => {
    const manifest = registry.getStrategyManifest("kpi-card-overview")!;
    const prompt = buildStrategyInputPrompt({
      slideIntent: makeIntent(),
      selection: makeSelection("kpi-card-overview"),
      manifest,
    });
    expect(prompt.selectedStrategy.inputSchema).toBeDefined();
  });

  it("instruction forbids coordinates and rendering", () => {
    const manifest = registry.getStrategyManifest("kpi-card-overview")!;
    const prompt = buildStrategyInputPrompt({
      slideIntent: makeIntent(),
      selection: makeSelection("kpi-card-overview"),
      manifest,
    });
    expect(prompt.instruction).toContain("Do not include coordinates");
    expect(prompt.instruction).toContain("rendering");
  });
});

// ---------------------------------------------------------------------------
// LLM response validation
// ---------------------------------------------------------------------------
describe("validateLlmStrategyInputResponse", () => {
  it("valid response passes", () => {
    const result = validateLlmStrategyInputResponse({
      strategyId: "one-message-summary",
      response: { message: "Hello world" },
    });
    expect(result.ok).toBe(true);
  });

  it("invalid response fails", () => {
    const result = validateLlmStrategyInputResponse({
      strategyId: "one-message-summary",
      response: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("unknown strategyId fails", () => {
    const result = validateLlmStrategyInputResponse({
      strategyId: "nonexistent",
      response: { message: "test" },
    });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SlideSpec bridge
// ---------------------------------------------------------------------------
describe("applyStrategyInputToSlideSpec", () => {
  it("sets preferredStrategyId", () => {
    const result = applyStrategyInputToSlideSpec({
      slideSpec: { id: "slide-1", title: "Test" },
      strategyId: "kpi-card-overview",
      strategyInput: { headline: "test", metrics: [] },
    });
    expect(result.preferredStrategyId).toBe("kpi-card-overview");
  });

  it("attaches strategyInput", () => {
    const input = { headline: "test", metrics: [{ label: "A", value: "1" }] };
    const result = applyStrategyInputToSlideSpec({
      slideSpec: { id: "slide-1" },
      strategyId: "kpi-card-overview",
      strategyInput: input,
    });
    expect(result.strategyInput).toBe(input);
  });

  it("preserves existing slideSpec fields", () => {
    const result = applyStrategyInputToSlideSpec({
      slideSpec: { id: "slide-1", title: "Original", customField: 42 },
      strategyId: "action-plan-table",
      strategyInput: {},
    });
    expect(result.id).toBe("slide-1");
    expect(result.title).toBe("Original");
    expect(result.customField).toBe(42);
  });
});
