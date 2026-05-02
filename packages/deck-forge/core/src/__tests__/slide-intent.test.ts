import { describe, expect, it } from "vitest";
import {
  createBuiltinStrategyRegistry,
  resolveSlideIntent,
  findStrategyCandidatesForIntent,
  createSlideIntentFromArchetype,
  toStrategyCandidatePromptItems,
} from "#src/strategy/index.js";
import type { SlideIntent, ResolvedSlideIntent } from "#src/strategy/index.js";

// ---------------------------------------------------------------------------
// 8.1 SlideIntent normalization
// ---------------------------------------------------------------------------

describe("resolveSlideIntent", () => {
  const deckDefaults = {
    audience: "manager" as const,
    genre: "business-review" as const,
    density: "high" as const,
  };

  it("uses slide-level audience when present", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
      audience: "engineer",
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.audience).toBe("engineer");
  });

  it("inherits deck audience when slide audience is omitted", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.audience).toBe("manager");
  });

  it("uses slide-level genre when present", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
      genre: "technical-architecture",
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.genre).toBe("technical-architecture");
  });

  it("inherits deck genre when slide genre is omitted", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.genre).toBe("business-review");
  });

  it("uses slide-level density when present", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
      density: "low",
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.density).toBe("low");
  });

  it("inherits deck density when slide density is omitted", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
    };
    const resolved = resolveSlideIntent(intent, deckDefaults);
    expect(resolved.density).toBe("high");
  });

  it("defaults density to 'medium' when both slide and deck omit it", () => {
    const intent: SlideIntent = {
      keyMessage: "test",
      intent: "report",
      contentKinds: ["kpi"],
    };
    const resolved = resolveSlideIntent(intent, {
      audience: "manager",
      genre: "business-review",
    });
    expect(resolved.density).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// 8.2 Strategy candidate selection
// ---------------------------------------------------------------------------

describe("findStrategyCandidatesForIntent", () => {
  const registry = createBuiltinStrategyRegistry();

  it("technical architecture → layered-architecture candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "The system is separated into frontend, gateway, services, and data layers.",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(ids).toContain("layered-architecture");
  });

  it("manufacturing operations KPI → kpi strategy candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "Line 4 performance is stable but temperature-related downtime needs attention.",
      audience: "manager",
      genre: "manufacturing-operations",
      intent: "report",
      contentKinds: ["kpi"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(ids.some((id) => id === "kpi-card-overview" || id === "kpi-dashboard-with-insight")).toBe(
      true,
    );
  });

  it("action plan → action-plan-table candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "The next actions need owners, due dates, and status tracking.",
      audience: "manager",
      genre: "incident-review",
      intent: "plan",
      contentKinds: ["action-plan", "table"],
      density: "high",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(ids).toContain("action-plan-table");
  });

  it("research result → data-insight-story or small-multiples-trend candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "The proposed method improves pixel-level metrics under contamination.",
      audience: "researcher",
      genre: "research-presentation",
      intent: "report",
      contentKinds: ["research-result", "chart"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(
      ids.some((id) => id === "data-insight-story" || id === "small-multiples-trend"),
    ).toBe(true);
  });

  it("returns reasons for each candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "Architecture overview",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const arch = candidates.find((c) => c.manifest.id === "layered-architecture");
    expect(arch).toBeDefined();
    expect(arch!.reasons.length).toBeGreaterThan(0);
    expect(arch!.reasons.some((r) => r.includes("architecture"))).toBe(true);
  });

  it("returns at most 5 candidates", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "General slide",
      audience: "general",
      genre: "business-review",
      intent: "summarize",
      contentKinds: ["summary"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    expect(candidates.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 8.3 preferredStrategyId
// ---------------------------------------------------------------------------

describe("findStrategyCandidatesForIntent — preferredStrategyId", () => {
  const registry = createBuiltinStrategyRegistry();

  it("valid preferredStrategyId is placed as first candidate", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
      preferredStrategyId: "event-timeline",
    };
    const { candidates, warnings } = findStrategyCandidatesForIntent(intent, registry);
    expect(candidates[0]?.manifest.id).toBe("event-timeline");
    expect(warnings).toHaveLength(0);
  });

  it("invalid preferredStrategyId produces warning", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
      preferredStrategyId: "non-existent-strategy",
    };
    const { warnings } = findStrategyCandidatesForIntent(intent, registry);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("non-existent-strategy");
  });

  it("invalid preferredStrategyId still returns fallback candidates", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
      preferredStrategyId: "non-existent-strategy",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    expect(candidates.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8.4 avoidStrategyIds
// ---------------------------------------------------------------------------

describe("findStrategyCandidatesForIntent — avoidStrategyIds", () => {
  const registry = createBuiltinStrategyRegistry();

  it("excluded strategies are not in candidates", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "Architecture overview",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
      avoidStrategyIds: ["layered-architecture"],
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(ids).not.toContain("layered-architecture");
  });

  it("avoidStrategyIds overrides preferredStrategyId", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
      preferredStrategyId: "layered-architecture",
      avoidStrategyIds: ["layered-architecture"],
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const ids = candidates.map((c) => c.manifest.id);
    expect(ids).not.toContain("layered-architecture");
  });
});

// ---------------------------------------------------------------------------
// 8.5 LLM prompt payload
// ---------------------------------------------------------------------------

describe("toStrategyCandidatePromptItems", () => {
  const registry = createBuiltinStrategyRegistry();

  it("returns JSON-serializable plain objects", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidates);

    // Should be serializable
    const json = JSON.stringify(items);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("contains id, name, description, chooseWhen, avoidWhen, reasons", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "engineer",
      genre: "technical-architecture",
      intent: "explain",
      contentKinds: ["architecture"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidates);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(Array.isArray(item.chooseWhen)).toBe(true);
      expect(Array.isArray(item.avoidWhen)).toBe(true);
      expect(Array.isArray(item.reasons)).toBe(true);
      expect(item.density).toBeTruthy();
    }
  });

  it("does not contain functions or class instances", () => {
    const intent: ResolvedSlideIntent = {
      keyMessage: "test",
      audience: "manager",
      genre: "business-review",
      intent: "report",
      contentKinds: ["kpi"],
      density: "medium",
    };
    const { candidates } = findStrategyCandidatesForIntent(intent, registry);
    const items = toStrategyCandidatePromptItems(candidates);

    for (const item of items) {
      for (const value of Object.values(item)) {
        expect(typeof value).not.toBe("function");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Archetype bridge
// ---------------------------------------------------------------------------

describe("createSlideIntentFromArchetype", () => {
  it("maps kpi_summary archetype to kpi contentKind and report intent", () => {
    const intent = createSlideIntentFromArchetype({
      archetype: "kpi_summary",
      keyMessage: "Q1 results",
      audience: "manager",
      genre: "business-review",
    });
    expect(intent.contentKinds).toContain("kpi");
    expect(intent.intent).toBe("report");
    expect(intent.preferredStrategyId).toBe("kpi-card-overview");
    expect(intent.archetype).toBe("kpi_summary");
  });

  it("maps architecture archetype to architecture contentKind and explain intent", () => {
    const intent = createSlideIntentFromArchetype({
      archetype: "architecture",
      keyMessage: "System layers",
      audience: "engineer",
      genre: "technical-architecture",
    });
    expect(intent.contentKinds).toContain("architecture");
    expect(intent.intent).toBe("explain");
    expect(intent.preferredStrategyId).toBe("layered-architecture");
  });

  it("handles unknown archetype gracefully", () => {
    const intent = createSlideIntentFromArchetype({
      archetype: "unknown_type",
      keyMessage: "test",
      audience: "general",
      genre: "business-review",
    });
    expect(intent.intent).toBe("summarize");
    expect(intent.contentKinds).toContain("summary");
    expect(intent.preferredStrategyId).toBeUndefined();
  });

  it("preserves audience, genre, density from input", () => {
    const intent = createSlideIntentFromArchetype({
      archetype: "comparison",
      keyMessage: "A vs B",
      audience: "executive",
      genre: "sales-proposal",
      density: "low",
    });
    expect(intent.audience).toBe("executive");
    expect(intent.genre).toBe("sales-proposal");
    expect(intent.density).toBe("low");
  });
});
