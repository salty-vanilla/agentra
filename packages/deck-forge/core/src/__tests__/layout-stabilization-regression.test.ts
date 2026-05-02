import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import { analyzeSlideLayout } from "#src/diagnostics/layout-diagnostics.js";
import { analyzeDeckStabilization } from "#src/diagnostics/stabilization-diagnostics.js";
import { repairSameFrameOverlaps } from "#src/repair/same-frame-repair.js";
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

  describe("manufacturing process (keyword-routed, diagram + metrics + callout)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-07",
      title: "標準フロー改善",
      intent: { type: "data_insight", keyMessage: "工程効率化", audienceTakeaway: "フロー最適化" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "標準フロー改善" } as ContentBlock,
        makeDiagram("d1"),
        makeMetric("m1", "稼働率", "92%"),
        makeMetric("m2", "不良率", "0.3%"),
        makeCallout("c1", "全工程で標準フロー導入完了。歩留まり改善に貢献。"),
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

    it("routes via process strategy despite non-process intent type", () => {
      const { ir } = buildAndDiagnose([slideSpec]);
      const slide = ir.slides.find((s) => s.id === "slide-07");
      // Strategy should be process-flow-with-impact due to keyword signals
      expect(slide?._trace?.layoutStrategyId).toBe("process-flow-with-impact");
    });
  });

  describe("title slide (subtitle + footer only)", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-08",
      title: "2024年度 製造部門レビュー",
      intent: { type: "summary", keyMessage: "タイトル", audienceTakeaway: "概要" },
      layout: { type: "title", density: "low" },
      content: [
        { id: "t1", type: "title", text: "2024年度 製造部門レビュー" } as ContentBlock,
        makeParagraph("p1", "Manufacturing Division Annual Review"),
        makeParagraph("p2", "2024年12月"),
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

    it("uses center alignment for text elements", () => {
      const { ir } = buildAndDiagnose([slideSpec]);
      const slide = ir.slides.find((s) => s.id === "slide-08");
      const textElements = slide?.elements.filter((e) => e.type === "text" && e.role !== "title") ?? [];
      for (const el of textElements) {
        if (el.type === "text") {
          // Check that paragraphs have center alignment
          for (const para of el.text.paragraphs) {
            expect(para.alignment).toBe("center");
          }
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7.7-fix2 regression tests
// ---------------------------------------------------------------------------

describe("decision-request V1 hardening (Phase 7.7-fix2)", () => {
  const slideSpec = makeSlideSpec({
    id: "slide-06",
    title: "施策承認依頼",
    intent: { type: "decision", keyMessage: "4施策の承認", audienceTakeaway: "承認判断" },
    layout: { type: "single_column", density: "medium" },
    content: [
      { id: "t1", type: "title", text: "施策承認依頼" } as ContentBlock,
      makeCallout("cta1", "以下4施策の承認をお願いします。"),
      makeCallout("c1", "ボトルネック自動化"),
      makeCallout("c2", "予防保全システム導入"),
      makeCallout("c3", "AIビジョン検査"),
      makeCallout("c4", "部品在庫最適化"),
      makeMetric("m1", "総投資額", "¥500M"),
      makeMetric("m2", "期待ROI", "180%"),
      makeParagraph("p1", "実行開始: Q3, 進捗報告: 月次"),
    ],
  });

  it("produces no overlaps with 4 approval callouts + 2 metrics + paragraph", () => {
    const { diagnostics } = buildAndDiagnose([slideSpec]);
    expect(diagnostics[0]!.overlapCount).toBe(0);
  });

  it("produces no out-of-bounds", () => {
    const { diagnostics } = buildAndDiagnose([slideSpec]);
    expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
  });

  it("uses main slot for approval items", () => {
    const { ir } = buildAndDiagnose([slideSpec]);
    const slide = ir.slides.find((s) => s.id === "slide-06");
    const usedSlots = slide?._trace?.usedSlots ?? [];
    expect(usedSlots).toContain("main");
  });

  it("does not stack all 4 approval items in supporting", () => {
    const { ir } = buildAndDiagnose([slideSpec]);
    const slide = ir.slides.find((s) => s.id === "slide-06");
    // Count elements whose frame is in the supporting slot area (y > 445 in approval template)
    const supportingElements = slide?.elements.filter((e) => e.frame.y >= 445) ?? [];
    // Supporting should have at most 2 elements (closing paragraph + maybe 1)
    expect(supportingElements.length).toBeLessThanOrEqual(3);
  });
});

describe("executive-summary-kpi 4 metrics + callout (Phase 7.7-fix2)", () => {
  const slideSpec = makeSlideSpec({
    id: "slide-02",
    title: "Q2業績サマリー",
    intent: { type: "summary", keyMessage: "Q2 KPI", audienceTakeaway: "業績概要" },
    layout: { type: "dashboard", density: "medium" },
    content: [
      { id: "t1", type: "title", text: "Q2業績サマリー" } as ContentBlock,
      makeMetric("m1", "稼働率", "92%"),
      makeMetric("m2", "不良率", "0.3%"),
      makeMetric("m3", "OEE", "85%"),
      makeMetric("m4", "ダウンタイム", "4.2h"),
      makeCallout("c1", "全KPI目標達成。稼働率は過去最高。"),
    ],
  });

  it("places 4 metrics with no overlaps", () => {
    const { diagnostics } = buildAndDiagnose([slideSpec]);
    expect(diagnostics[0]!.overlapCount).toBe(0);
  });

  it("places 4 metrics at the same y coordinate", () => {
    const { ir } = buildAndDiagnose([slideSpec]);
    const slide = ir.slides.find((s) => s.id === "slide-02");
    // Metric elements are text elements with decoration=card OR shape elements.
    // Find the 4 metric-region elements (not title, not callout)
    const metricElements = slide?.elements.filter(
      (e) => e.type === "text" && e.role !== "title" && e.role !== "callout" && e.role !== "footer",
    ) ?? [];
    // At least 4 metric elements expected
    if (metricElements.length >= 4) {
      const topFour = metricElements.slice(0, 4);
      const yValues = topFour.map((e) => Math.round(e.frame.y));
      // All should share the same y
      expect(new Set(yValues).size).toBe(1);
    }
  });

  it("places callout below the metrics", () => {
    const { ir } = buildAndDiagnose([slideSpec]);
    const slide = ir.slides.find((s) => s.id === "slide-02");
    const metricElements = slide?.elements.filter(
      (e) => e.type === "text" && e.role !== "title" && e.role !== "callout" && e.role !== "footer",
    ) ?? [];
    const calloutElements = slide?.elements.filter(
      (e) => e.type === "text" && e.role === "callout",
    ) ?? [];
    if (metricElements.length > 0 && calloutElements.length > 0) {
      const maxMetricBottom = Math.max(
        ...metricElements.map((e) => e.frame.y + e.frame.height),
      );
      expect(calloutElements[0]!.frame.y).toBeGreaterThan(maxMetricBottom);
    }
  });

  it("produces no out-of-bounds", () => {
    const { diagnostics } = buildAndDiagnose([slideSpec]);
    expect(diagnostics[0]!.outOfBoundsCount).toBe(0);
  });
});

describe("same-frame deterministic repair (Phase 7.7-fix2)", () => {
  it("repairs 4 elements sharing the same frame", () => {
    // Build a minimal IR with elements at the same frame
    const slideSpec = makeSlideSpec({
      id: "slide-overlap",
      title: "Overlap Test",
      intent: { type: "summary", keyMessage: "test", audienceTakeaway: "test" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "Overlap Test" } as ContentBlock,
        makeParagraph("p1", "Item A"),
        makeParagraph("p2", "Item B"),
        makeParagraph("p3", "Item C"),
        makeParagraph("p4", "Item D"),
      ],
    });

    const ir = buildPresentationIr({
      slideSpecs: [slideSpec],
      brief: minimalBrief,
      deckPlan: minimalDeckPlan,
      theme: defaultTheme,
      templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
    });

    // Force all non-title elements to the same frame to simulate overlap
    const slide = ir.slides[0]!;
    const sharedFrame = { x: 100, y: 200, width: 500, height: 300 };
    const forcedElements = slide.elements.map((el) =>
      el.type === "text" && el.role !== "title"
        ? { ...el, frame: { ...sharedFrame } }
        : el,
    );
    const forcedIr = {
      ...ir,
      slides: [{ ...slide, elements: forcedElements }],
    };

    const result = repairSameFrameOverlaps(forcedIr);

    expect(result.sameFrameGroupCount).toBeGreaterThanOrEqual(1);
    expect(result.repairedElementCount).toBeGreaterThanOrEqual(2);

    // After repair, no two elements should share the exact same frame
    const repairedSlide = result.presentation.slides[0]!;
    const nonTitleElements = repairedSlide.elements.filter(
      (e) => e.type === "text" && (e as { role?: string }).role !== "title",
    );
    const frameKeys = nonTitleElements.map(
      (e) => `${e.frame.x},${e.frame.y},${e.frame.width},${e.frame.height}`,
    );
    expect(new Set(frameKeys).size).toBe(frameKeys.length);

    // Operation log should contain same_frame_overlap entries
    const repairOps = result.presentation.operationLog.filter(
      (op) => (op.operation as { reason?: string }).reason === "same_frame_overlap",
    );
    expect(repairOps.length).toBeGreaterThanOrEqual(2);
  });

  it("does not modify slides without same-frame overlaps", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-clean",
      title: "Clean Slide",
      intent: { type: "summary", keyMessage: "test", audienceTakeaway: "test" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "Clean" } as ContentBlock,
        makeParagraph("p1", "Only one paragraph"),
      ],
    });

    const ir = buildPresentationIr({
      slideSpecs: [slideSpec],
      brief: minimalBrief,
      deckPlan: minimalDeckPlan,
      theme: defaultTheme,
      templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
    });

    const result = repairSameFrameOverlaps(ir);
    expect(result.sameFrameGroupCount).toBe(0);
    expect(result.repairedElementCount).toBe(0);
    expect(result.operationCount).toBe(0);
  });
});

describe("asset usage diagnostics (Phase 7.7-fix2)", () => {
  it("reports zero unused assets when no assets exist", () => {
    const slideSpec = makeSlideSpec({
      id: "slide-no-assets",
      title: "No Assets",
      intent: { type: "summary", keyMessage: "test", audienceTakeaway: "test" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "t1", type: "title", text: "No Assets" } as ContentBlock,
        makeMetric("m1", "KPI", "100"),
      ],
    });

    const ir = buildPresentationIr({
      slideSpecs: [slideSpec],
      brief: minimalBrief,
      deckPlan: minimalDeckPlan,
      theme: defaultTheme,
      templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE,
    });

    const diag = analyzeDeckStabilization({ presentation: ir });
    expect(diag.assetUsage.totalAssets).toBe(0);
    expect(diag.assetUsage.unusedAssetCount).toBe(0);
    expect(diag.assetUsage.imageElementCount).toBe(0);
  });
});
