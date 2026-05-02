import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import { analyzeSlideLayout } from "#src/diagnostics/layout-diagnostics.js";
import { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";
import type {
  ContentBlock,
  DeckPlan,
  SlideSpec,
  ThemeSpec,
  PresentationBrief,
} from "#src/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMetric(id: string, label: string, value: string): ContentBlock {
  return { id, type: "metric", label, value } as ContentBlock;
}

function makeCallout(id: string, text: string): ContentBlock {
  return { id, type: "callout", text } as ContentBlock;
}

function makeParagraph(id: string, text: string): ContentBlock {
  return { id, type: "paragraph", text } as ContentBlock;
}

function makeChart(id: string): ContentBlock {
  return {
    id,
    type: "chart",
    chartType: "line",
    data: { series: [{ name: "A", values: [1, 2, 3] }] },
    encoding: {},
  } as ContentBlock;
}

function makeDiagram(id: string): ContentBlock {
  return {
    id,
    type: "diagram",
    diagramType: "flowchart",
    nodes: [
      { id: "n1", label: "Step 1" },
      { id: "n2", label: "Step 2" },
      { id: "n3", label: "Step 3" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
    ],
  } as ContentBlock;
}

function makeBulletList(id: string, items: string[]): ContentBlock {
  return {
    id,
    type: "bullet_list",
    items: items.map((text) => ({ text })),
  } as ContentBlock;
}

function makeSlideSpec(overrides: Partial<SlideSpec> & { content: SlideSpec["content"] }): SlideSpec {
  return {
    id: "slide-01",
    slideNumber: 1,
    title: "Test Slide",
    intent: { type: "data_insight", keyMessage: "test", audienceTakeaway: "test" },
    layout: { type: "single_column", density: "medium" },
    ...overrides,
  } as SlideSpec;
}

const minimalBrief = {
  goal: { objective: "test" },
  audience: { role: "executive" },
  tone: { style: "professional" },
  output: { format: "pptx" },
} as unknown as PresentationBrief;

const minimalDeckPlan = {
  id: "dp-1",
  title: "Test",
  sections: [],
  slides: [],
} as unknown as DeckPlan;

const defaultTheme = {
  colors: {
    primary: "#1a2b5e",
    secondary: "#4a90d9",
    accent: "#f5a623",
    background: "#ffffff",
    textPrimary: "#1a1a1a",
    textSecondary: "#555555",
    surface: "#f5f5f5",
    border: "#cccccc",
  },
  typography: {
    fontFamily: { heading: "Arial", body: "Arial", mono: "Courier" },
    fontSize: { title: 36, heading: 28, subheading: 22, body: 16, caption: 12 },
    lineHeight: { normal: 1.5, tight: 1.2, loose: 1.8 },
  },
} as unknown as ThemeSpec;

function buildAndDiagnose(slideSpecs: SlideSpec[]) {
  const ir = buildPresentationIr({
    slideSpecs,
    brief: minimalBrief,
    deckPlan: minimalDeckPlan,
    theme: defaultTheme,
    templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
  });

  const diagnostics = ir.slides.map((slide) =>
    analyzeSlideLayout(slide),
  );
  return { ir, diagnostics };
}

// ---------------------------------------------------------------------------
// Regression tests — representative deck patterns
// ---------------------------------------------------------------------------

describe("layout stabilization regression", () => {
  describe("Q2 KPI summary (4 metrics + callout)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-02",
      title: "Q2業績サマリー",
      intent: { type: "summary", keyMessage: "Q2 KPI", audienceTakeaway: "業績概要" },
      layout: { type: "dashboard", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "Q2業績サマリー" } as ContentBlock,
        makeMetric("m1", "売上", "¥120M"),
        makeMetric("m2", "利益率", "18%"),
        makeMetric("m3", "顧客数", "1,200"),
        makeMetric("m4", "NPS", "72"),
        makeCallout("c1", "全KPI目標達成。特にNPSは前年比+15pt。"),
      ],
    });

    it("produces no overlaps", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.overlapCount).toBe(0);
    });

    it("produces no out-of-bounds", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
    });

    it("has no fallback slots", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.fallbackSlots).toEqual([]);
    });

    it("achieves reasonable slot coverage", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.slotCoverageRatio).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("downtime cause visual insight (chart + metric + bullets + callout)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-03",
      title: "ダウンタイム原因分析",
      intent: { type: "data_insight", keyMessage: "主因分析", audienceTakeaway: "改善施策" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "ダウンタイム原因分析" } as ContentBlock,
        makeChart("ch1"),
        makeMetric("m1", "平均復旧時間", "4.2h"),
        makeBulletList("bl1", ["HW障害 42%", "SW障害 35%", "人的ミス 23%"]),
        makeCallout("c1", "HW障害は予防保全で60%削減可能。"),
      ],
    });

    it("produces no overlaps", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.overlapCount).toBe(0);
    });

    it("produces no out-of-bounds", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
    });
  });

  describe("monthly small multiples (3 charts + callout)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-04",
      title: "月次推移比較",
      intent: { type: "data_insight", keyMessage: "月次トレンド", audienceTakeaway: "推移確認" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "月次推移比較" } as ContentBlock,
        makeChart("ch1"),
        makeChart("ch2"),
        makeChart("ch3"),
        makeCallout("c1", "3月以降、売上は回復基調。"),
      ],
    });

    it("produces no overlaps", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.overlapCount).toBe(0);
    });

    it("produces no out-of-bounds", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
    });
  });

  describe("process with impact (diagram + metric + callout)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-05",
      title: "改善プロセス",
      intent: { type: "process", keyMessage: "プロセス改善", audienceTakeaway: "効果確認" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "改善プロセス" } as ContentBlock,
        makeDiagram("d1"),
        makeMetric("m1", "コスト削減", "¥30M"),
        makeCallout("c1", "全工程で20%の工数削減を達成。"),
      ],
    });

    it("produces no overlaps", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.overlapCount).toBe(0);
    });

    it("produces no out-of-bounds", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
    });

    it("has no fallback slots", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.fallbackSlots).toEqual([]);
    });
  });

  describe("approval request (callout + 4 initiatives + 2 metrics + supporting)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-06",
      title: "施策承認依頼",
      intent: { type: "decision", keyMessage: "4施策の承認", audienceTakeaway: "承認判断" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "施策承認依頼" } as ContentBlock,
        makeCallout("c1", "以下4施策の承認をお願いします。"),
        makeParagraph("p1", "施策A: デジタル化推進"),
        makeParagraph("p2", "施策B: 人材育成強化"),
        makeParagraph("p3", "施策C: コスト最適化"),
        makeParagraph("p4", "施策D: 顧客体験向上"),
        makeMetric("m1", "総投資額", "¥500M"),
        makeMetric("m2", "期待ROI", "180%"),
        makeParagraph("p5", "実施責任者: 事業部長"),
      ],
    });

    it("produces no overlaps", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.overlapCount).toBe(0);
    });

    it("produces no out-of-bounds", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
    });

    it("has no fallback slots", () => {
      const { diagnostics } = buildAndDiagnose([slideSpec]);
      expect(diagnostics[0]!.fallbackSlots).toEqual([]);
    });
  });
});
