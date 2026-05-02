import { describe, expect, it } from "vitest";
import {
  createBuiltinStrategyRegistry,
  StrategyRegistry,
} from "#src/strategy/index.js";
import type {
  AudienceType,
  CommunicationIntent,
  ContentKind,
  DensityLevel,
  PresentationGenre,
  StrategyManifest,
} from "#src/strategy/index.js";

describe("StrategyManifest registry", () => {
  const registry = createBuiltinStrategyRegistry();

  it("listStrategyManifests returns all registered strategies", () => {
    const all = registry.listStrategyManifests();
    expect(all.length).toBeGreaterThanOrEqual(17);
  });

  it("each manifest has required fields", () => {
    for (const m of registry.listStrategyManifests()) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.suitableFor.length).toBeGreaterThan(0);
      expect(m.audiences.length).toBeGreaterThan(0);
      expect(m.intents.length).toBeGreaterThan(0);
      expect(m.contentKinds.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(m.density);
      expect(m.chooseWhen.length).toBeGreaterThan(0);
      expect(m.avoidWhen.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const all = registry.listStrategyManifests();
    const ids = all.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getStrategyManifest returns by id", () => {
    const m = registry.getStrategyManifest("kpi-dashboard-with-insight");
    expect(m).toBeDefined();
    expect(m!.id).toBe("kpi-dashboard-with-insight");
  });

  it("getStrategyManifest returns undefined for unknown id", () => {
    expect(registry.getStrategyManifest("non-existent")).toBeUndefined();
  });
});

describe("StrategyManifest canonical language", () => {
  const registry = createBuiltinStrategyRegistry();
  const japaneseCharPattern = /[\u3040-\u30ff\u3400-\u9fff]/;

  it("name contains no Japanese characters", () => {
    for (const m of registry.listStrategyManifests()) {
      expect(m.name).not.toMatch(japaneseCharPattern);
    }
  });

  it("description contains no Japanese characters", () => {
    for (const m of registry.listStrategyManifests()) {
      expect(m.description).not.toMatch(japaneseCharPattern);
    }
  });

  it("chooseWhen entries contain no Japanese characters", () => {
    for (const m of registry.listStrategyManifests()) {
      for (const c of m.chooseWhen) {
        expect(c).not.toMatch(japaneseCharPattern);
      }
    }
  });

  it("avoidWhen entries contain no Japanese characters", () => {
    for (const m of registry.listStrategyManifests()) {
      for (const a of m.avoidWhen) {
        expect(a).not.toMatch(japaneseCharPattern);
      }
    }
  });
});

describe("Strategy ID specificity", () => {
  const registry = createBuiltinStrategyRegistry();

  it("does not contain overly generic IDs", () => {
    const ids = registry.listStrategyManifests().map((m) => m.id);
    expect(ids).not.toContain("comparison");
    expect(ids).not.toContain("timeline");
    expect(ids).not.toContain("matrix");
    expect(ids).not.toContain("dashboard");
  });

  it("contains specific replacement IDs", () => {
    const ids = registry.listStrategyManifests().map((m) => m.id);
    expect(ids).toContain("two-column-comparison");
    expect(ids).toContain("event-timeline");
    expect(ids).toContain("two-axis-matrix");
    expect(ids).toContain("metric-tile-dashboard");
  });

  it("kpi-card-overview exists instead of executive-summary-kpi", () => {
    expect(registry.getStrategyManifest("kpi-card-overview")).toBeDefined();
    expect(registry.getStrategyManifest("executive-summary-kpi")).toBeUndefined();
  });
});

describe("StrategyManifest filtering", () => {
  const registry = createBuiltinStrategyRegistry();

  it("filters by audience: engineer returns technical strategies", () => {
    const results = registry.findStrategyManifests({ audience: "engineer" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("layered-architecture");
    expect(ids).toContain("process-flow-with-impact");
  });

  it("filters by audience: operator returns operations strategies", () => {
    const results = registry.findStrategyManifests({ audience: "operator" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("process-flow-with-impact");
    expect(ids).toContain("action-plan-table");
  });

  it("filters by genre: manufacturing-operations", () => {
    const results = registry.findStrategyManifests({
      genre: "manufacturing-operations",
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("kpi-card-overview");
    expect(ids).toContain("process-flow-with-impact");
    expect(ids).toContain("action-plan-table");
  });

  it("filters by genre: technical-architecture", () => {
    const results = registry.findStrategyManifests({
      genre: "technical-architecture",
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("layered-architecture");
  });

  it("filters by contentKind: kpi", () => {
    const results = registry.findStrategyManifests({ contentKind: "kpi" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("kpi-card-overview");
    expect(ids).toContain("kpi-dashboard-with-insight");
  });

  it("filters by contentKind: architecture", () => {
    const results = registry.findStrategyManifests({
      contentKind: "architecture",
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("layered-architecture");
  });

  it("filters by density: high", () => {
    const results = registry.findStrategyManifests({ density: "high" });
    expect(results.length).toBeGreaterThan(0);
    for (const m of results) {
      expect(m.density).toBe("high");
    }
  });

  it("filters by density: low", () => {
    const results = registry.findStrategyManifests({ density: "low" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("one-message-summary");
    expect(ids).toContain("three-point-summary");
  });

  it("filters by intent: decide", () => {
    const results = registry.findStrategyManifests({ intent: "decide" });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("decision-request");
    expect(ids).toContain("recommendation-comparison");
  });

  it("combined filters narrow results", () => {
    const results = registry.findStrategyManifests({
      audience: "engineer",
      genre: "engineering-design-review",
      intent: "compare",
    });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((m) => m.id);
    expect(ids).toContain("recommendation-comparison");
  });

  it("empty result for impossible combination", () => {
    const results = registry.findStrategyManifests({
      audience: "researcher",
      genre: "manufacturing-operations",
      density: "low",
    });
    expect(results.length).toBe(0);
  });
});

describe("Strategy boundary clarity", () => {
  const registry = createBuiltinStrategyRegistry();

  it("kpi-dashboard-with-insight supports charts", () => {
    const m = registry.getStrategyManifest("kpi-dashboard-with-insight")!;
    expect(m.capabilities?.supportsCharts).toBe(true);
  });

  it("metric-tile-dashboard is high density grid overview", () => {
    const m = registry.getStrategyManifest("metric-tile-dashboard")!;
    expect(m.density).toBe("high");
    expect(m.description).toMatch(/grid|tile/i);
  });

  it("data-insight-story does not include root-cause in contentKinds", () => {
    const m = registry.getStrategyManifest("data-insight-story")!;
    expect(m.contentKinds).not.toContain("root-cause");
  });

  it("layered-architecture supports icons", () => {
    const m = registry.getStrategyManifest("layered-architecture")!;
    expect(m.capabilities?.supportsIcons).toBe(true);
  });
});

describe("Executive dependency elimination", () => {
  it("registry initializes without executive-navy-v1 theme", () => {
    const registry = createBuiltinStrategyRegistry();
    expect(registry.listStrategyManifests().length).toBeGreaterThan(0);
  });

  it("AudienceType 'engineer' strategies exist", () => {
    const registry = createBuiltinStrategyRegistry();
    const results = registry.findStrategyManifests({ audience: "engineer" });
    expect(results.length).toBeGreaterThanOrEqual(5);
  });

  it("PresentationGenre 'technical-architecture' strategies exist", () => {
    const registry = createBuiltinStrategyRegistry();
    const results = registry.findStrategyManifests({
      genre: "technical-architecture",
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("executive strategies are accessible via manifest", () => {
    const registry = createBuiltinStrategyRegistry();
    const execResults = registry.findStrategyManifests({
      audience: "executive",
    });
    expect(execResults.length).toBeGreaterThan(0);
    const ids = execResults.map((m) => m.id);
    expect(ids).toContain("kpi-card-overview");
    expect(ids).toContain("decision-request");
  });

  it("non-executive audiences have strategies not shared with executive", () => {
    const registry = createBuiltinStrategyRegistry();
    const engineerOnly = registry
      .findStrategyManifests({ audience: "engineer" })
      .filter((m) => !m.audiences.includes("executive"));
    expect(engineerOnly.length).toBeGreaterThan(0);
  });
});

describe("StrategyRegistry API", () => {
  it("register adds a custom manifest", () => {
    const registry = new StrategyRegistry();
    const custom: StrategyManifest = {
      id: "custom-test",
      name: "Custom Test",
      description: "A test strategy",
      suitableFor: ["training"],
      audiences: ["general"],
      intents: ["teach"],
      contentKinds: ["training-step"],
      density: "low",
      chooseWhen: ["testing"],
      avoidWhen: ["production"],
    };
    registry.register(custom);
    expect(registry.getStrategyManifest("custom-test")).toBe(custom);
    expect(registry.listStrategyManifests()).toHaveLength(1);
  });

  it("register overwrites existing manifest with same id", () => {
    const registry = new StrategyRegistry();
    const v1: StrategyManifest = {
      id: "my-strategy",
      name: "V1",
      description: "version 1",
      suitableFor: ["training"],
      audiences: ["general"],
      intents: ["teach"],
      contentKinds: ["training-step"],
      density: "low",
      chooseWhen: ["v1"],
      avoidWhen: ["never"],
    };
    const v2: StrategyManifest = {
      ...v1,
      name: "V2",
      description: "version 2",
    };
    registry.register(v1);
    registry.register(v2);
    expect(registry.listStrategyManifests()).toHaveLength(1);
    expect(registry.getStrategyManifest("my-strategy")!.name).toBe("V2");
  });
});

describe("StrategyManifest chooseWhen/avoidWhen format", () => {
  const registry = createBuiltinStrategyRegistry();
  const manifests = registry.listStrategyManifests();

  it("every chooseWhen entry starts with 'Use when'", () => {
    for (const m of manifests) {
      for (const entry of m.chooseWhen) {
        expect(entry).toMatch(/^Use when /);
      }
    }
  });

  it("every avoidWhen entry starts with 'Avoid when'", () => {
    for (const m of manifests) {
      for (const entry of m.avoidWhen) {
        expect(entry).toMatch(/^Avoid when /);
      }
    }
  });

  it("no empty strings in chooseWhen or avoidWhen", () => {
    for (const m of manifests) {
      for (const entry of [...m.chooseWhen, ...m.avoidWhen]) {
        expect(entry.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("no duplicate entries within a single manifest chooseWhen", () => {
    for (const m of manifests) {
      expect(new Set(m.chooseWhen).size).toBe(m.chooseWhen.length);
    }
  });

  it("no duplicate entries within a single manifest avoidWhen", () => {
    for (const m of manifests) {
      expect(new Set(m.avoidWhen).size).toBe(m.avoidWhen.length);
    }
  });

  it("no overlap between chooseWhen and avoidWhen in any manifest", () => {
    for (const m of manifests) {
      const overlap = m.chooseWhen.filter((c) => m.avoidWhen.includes(c));
      expect(overlap).toHaveLength(0);
    }
  });
});
