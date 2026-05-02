import { describe, it, expect, beforeEach } from "vitest";
import {
  contentContractToBlocks,
  resetContractIdCounter,
  validateContentContract,
} from "@deck-forge/core";
import type { SlideSpec, ContentBlock } from "@deck-forge/core";

function makeSlideSpec(overrides: Partial<SlideSpec> = {}): SlideSpec {
  return {
    id: "slide-test",
    title: "Test Slide",
    intent: { type: "data_insight", keyMessage: "test", audienceTakeaway: "test" },
    layout: { type: "dashboard", density: "medium" },
    content: [],
    ...overrides,
  } as SlideSpec;
}

describe("contract validation", () => {
  it("validates a valid kpi_summary contract", () => {
    const result = validateContentContract({
      archetype: "kpi_summary",
      message: "KPIs on track",
      metrics: [
        { label: "稼働率", value: "92", unit: "%" },
        { label: "不良率", value: "0.8", unit: "%" },
        { label: "OEE", value: "78", unit: "pt" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("rejects invalid contract (missing archetype)", () => {
    const result = validateContentContract({ message: "test" });
    expect(result.valid).toBe(false);
    expect(result.warnings[0].code).toBe("contract_validation_failed");
  });

  it("warns on kpi_summary with 7 metrics (but passes validation)", () => {
    // Zod max(6) will fail for 7 metrics
    const result = validateContentContract({
      archetype: "kpi_summary",
      message: "too many",
      metrics: Array.from({ length: 7 }, (_, i) => ({
        label: `M${i}`,
        value: `${i}`,
      })),
    });
    expect(result.valid).toBe(false);
  });

  it("validates a valid approval_request contract", () => {
    const result = validateContentContract({
      archetype: "approval_request",
      cta: "承認をお願いします",
      approvalItems: [
        { title: "ボトルネック自動化" },
        { title: "予防保全" },
      ],
      metrics: [{ label: "OEE目標", value: "80", unit: "pt" }],
    });
    expect(result.valid).toBe(true);
  });

  it("warns on approval_request missing cta", () => {
    const result = validateContentContract({
      archetype: "approval_request",
      cta: "",
      approvalItems: [{ title: "施策1" }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === "missing_cta")).toBe(true);
  });

  it("validates a valid trend_small_multiples contract", () => {
    const result = validateContentContract({
      archetype: "trend_small_multiples",
      message: "Trend analysis",
      series: [
        { label: "OEE", values: [{ period: "Q1", value: 75 }, { period: "Q2", value: 78 }] },
        { label: "DT", values: [{ period: "Q1", value: 16 }, { period: "Q2", value: 14 }] },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("validates cause_analysis partial breakdown", () => {
    const result = validateContentContract({
      archetype: "cause_analysis",
      message: "Equipment-driven downtime",
      breakdown: [
        { label: "設備起因", value: 60, unit: "%", source: "provided" },
        { label: "その他", value: 40, unit: "%", source: "derived_complement" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("contract-to-blocks", () => {
  beforeEach(() => {
    resetContractIdCounter();
  });

  it("returns undefined when no contentContract", () => {
    const spec = makeSlideSpec();
    expect(contentContractToBlocks(spec)).toBeUndefined();
  });

  it("converts kpi_summary to metric + callout blocks", () => {
    const spec = makeSlideSpec({
      contentContract: {
        archetype: "kpi_summary",
        message: "KPIs on track",
        metrics: [
          { label: "稼働率", value: "92", unit: "%" },
          { label: "不良率", value: "0.8", unit: "%" },
          { label: "OEE", value: "78", unit: "pt" },
        ],
        insight: "Q3施策でOEE 80ptを狙う",
      },
    });
    const blocks = contentContractToBlocks(spec)!;
    expect(blocks).toBeDefined();
    // 1 message callout + 3 metrics + 1 insight callout = 5 blocks
    expect(blocks).toHaveLength(5);
    expect(blocks[0].type).toBe("callout");
    expect(blocks.filter((b) => b.type === "metric")).toHaveLength(3);
    expect(blocks[4].type).toBe("callout");
  });

  it("converts approval_request to cta + approval items + metric + paragraph", () => {
    const spec = makeSlideSpec({
      contentContract: {
        archetype: "approval_request",
        cta: "本日、Q3施策4件の承認をお願いします",
        approvalItems: [
          { title: "ボトルネック自動化" },
          { title: "予防保全" },
          { title: "AIビジョン導入" },
          { title: "部品在庫最適化" },
        ],
        metrics: [
          { label: "OEE目標", value: "80", unit: "pt" },
          { label: "DT目標", value: "12h以内" },
        ],
        supporting: "承認後、Q3で順次実行",
      },
    });
    const blocks = contentContractToBlocks(spec)!;
    expect(blocks).toBeDefined();
    // 1 cta + 4 approval items + 2 metrics + 1 supporting = 8
    expect(blocks).toHaveLength(8);
    expect(blocks[0].type).toBe("callout"); // CTA
    expect(blocks.filter((b) => b.type === "callout")).toHaveLength(5); // cta + 4 approval items
    expect(blocks.filter((b) => b.type === "metric")).toHaveLength(2);
    expect(blocks[7].type).toBe("paragraph"); // supporting
  });

  it("converts process_with_impact to diagram + metric + callout", () => {
    const spec = makeSlideSpec({
      contentContract: {
        archetype: "process_with_impact",
        message: "4-step improvement",
        steps: ["分析", "設計", "実装", "検証"],
        impactMetric: { label: "OEE改善", value: "+5", unit: "pt" },
        insight: "Q3完了見込み",
      },
    });
    const blocks = contentContractToBlocks(spec)!;
    expect(blocks).toBeDefined();
    // 1 message callout + 1 diagram + 1 metric + 1 insight callout = 4
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("callout");
    expect(blocks[1].type).toBe("diagram");
    expect(blocks[2].type).toBe("metric");
    expect(blocks[3].type).toBe("callout");
  });

  it("converts trend_small_multiples to chart blocks + callout", () => {
    const spec = makeSlideSpec({
      contentContract: {
        archetype: "trend_small_multiples",
        message: "OEE & DT trends",
        series: [
          { label: "OEE", values: [{ period: "Q1", value: 75 }, { period: "Q2", value: 78 }] },
          { label: "DT", unit: "h", values: [{ period: "Q1", value: 16 }, { period: "Q2", value: 14 }] },
        ],
        insight: "Both improving",
      },
    });
    const blocks = contentContractToBlocks(spec)!;
    expect(blocks).toBeDefined();
    // 1 message callout + 2 charts + 1 insight callout = 4
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((b) => b.type === "chart")).toHaveLength(2);
  });

  it("converts cause_analysis to chart + metric + callout", () => {
    const spec = makeSlideSpec({
      contentContract: {
        archetype: "cause_analysis",
        message: "Downtime root cause",
        breakdown: [
          { label: "設備起因", value: 60, unit: "%" as const, source: "provided" },
          { label: "その他", value: 40, unit: "%" as const, source: "derived_complement" },
        ],
        keyMetric: { label: "ダウンタイム", value: "14", unit: "h" },
        insight: "設備起因が主因",
      },
    });
    const blocks = contentContractToBlocks(spec)!;
    expect(blocks).toBeDefined();
    // 1 message callout + 1 chart + 1 metric + 1 insight callout = 4
    expect(blocks).toHaveLength(4);
    expect(blocks.filter((b) => b.type === "chart")).toHaveLength(1);
  });
});
