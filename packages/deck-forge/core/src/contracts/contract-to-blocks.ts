import type {
  ContentBlock,
  ContentContract,
  KpiSummaryContract,
  ApprovalRequestContract,
  TrendSmallMultiplesContract,
  ProcessWithImpactContract,
  CauseAnalysisContract,
  SlideSpec,
} from "#src/index.js";

let _nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${_nextId++}`;
}

/** Reset the ID counter — useful for deterministic tests. */
export function resetContractIdCounter(): void {
  _nextId = 1;
}

/**
 * Convert a contentContract to standard ContentBlock[].
 * If the slideSpec has no contentContract, returns undefined (caller
 * should use the existing content blocks).
 */
export function contentContractToBlocks(slideSpec: SlideSpec): ContentBlock[] | undefined {
  const contract = slideSpec.contentContract;
  if (!contract) return undefined;

  switch (contract.archetype) {
    case "kpi_summary":
      return kpiSummaryToBlocks(contract);
    case "approval_request":
      return approvalRequestToBlocks(contract);
    case "trend_small_multiples":
      return trendSmallMultiplesToBlocks(contract);
    case "process_with_impact":
      return processWithImpactToBlocks(contract);
    case "cause_analysis":
      return causeAnalysisToBlocks(contract);
    default:
      return undefined;
  }
}

function kpiSummaryToBlocks(c: KpiSummaryContract): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Message as callout
  blocks.push({
    id: genId("callout"),
    type: "callout" as const,
    text: c.message,
    tone: "info" as const,
  });

  // Metrics
  for (const m of c.metrics) {
    blocks.push({
      id: genId("metric"),
      type: "metric" as const,
      label: m.label,
      value: m.value,
      unit: m.unit,
      trend: m.trend,
    });
  }

  // Insight as callout
  if (c.insight) {
    blocks.push({
      id: genId("callout"),
      type: "callout" as const,
      text: c.insight,
      tone: "info" as const,
    });
  }

  return blocks;
}

function approvalRequestToBlocks(c: ApprovalRequestContract): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // CTA as callout
  blocks.push({
    id: genId("cta"),
    type: "callout" as const,
    text: c.cta,
    tone: "warning" as const,
  });

  // Approval items as callouts (with approval_item semantics)
  for (const item of c.approvalItems) {
    const text = item.description ? `${item.title}: ${item.description}` : item.title;
    blocks.push({
      id: genId("approval"),
      type: "callout" as const,
      text,
      tone: "info" as const,
    });
  }

  // Metrics
  if (c.metrics) {
    for (const m of c.metrics) {
      blocks.push({
        id: genId("metric"),
        type: "metric" as const,
        label: m.label,
        value: m.value,
        unit: m.unit,
      });
    }
  }

  // Supporting
  if (c.supporting) {
    blocks.push({
      id: genId("supporting"),
      type: "paragraph" as const,
      text: c.supporting,
    });
  }

  return blocks;
}

function trendSmallMultiplesToBlocks(c: TrendSmallMultiplesContract): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Message as callout
  blocks.push({
    id: genId("callout"),
    type: "callout" as const,
    text: c.message,
    tone: "info" as const,
  });

  // Each series as a chart block
  for (const s of c.series) {
    blocks.push({
      id: genId("chart"),
      type: "chart" as const,
      chartType: "line" as const,
      title: s.label,
      data: {
        series: [{ name: s.label, values: s.values.map((v) => v.value) }],
        categories: s.values.map((v) => v.period),
      },
      encoding: { x: "period", y: "value" },
    });
  }

  if (c.insight) {
    blocks.push({
      id: genId("callout"),
      type: "callout" as const,
      text: c.insight,
      tone: "info" as const,
    });
  }

  return blocks;
}

function processWithImpactToBlocks(c: ProcessWithImpactContract): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Message as callout
  blocks.push({
    id: genId("callout"),
    type: "callout" as const,
    text: c.message,
    tone: "info" as const,
  });

  // Steps as a flowchart diagram
  blocks.push({
    id: genId("diagram"),
    type: "diagram" as const,
    diagramType: "flowchart" as const,
    nodes: c.steps.map((step, i) => ({
      id: `step-${i + 1}`,
      label: step,
    })),
    edges: c.steps.slice(0, -1).map((_, i) => ({
      id: `edge-${i + 1}`,
      from: `step-${i + 1}`,
      to: `step-${i + 2}`,
    })),
  });

  // Impact metric
  if (c.impactMetric) {
    blocks.push({
      id: genId("metric"),
      type: "metric" as const,
      label: c.impactMetric.label,
      value: c.impactMetric.value,
      unit: c.impactMetric.unit,
    });
  }

  if (c.insight) {
    blocks.push({
      id: genId("callout"),
      type: "callout" as const,
      text: c.insight,
      tone: "info" as const,
    });
  }

  return blocks;
}

function causeAnalysisToBlocks(c: CauseAnalysisContract): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Message as callout
  blocks.push({
    id: genId("callout"),
    type: "callout" as const,
    text: c.message,
    tone: "info" as const,
  });

  // Breakdown as pie chart
  if (c.breakdown && c.breakdown.length > 0) {
    blocks.push({
      id: genId("chart"),
      type: "chart" as const,
      chartType: "pie" as const,
      title: "構成比",
      data: {
        series: [{ name: "breakdown", values: c.breakdown.map((b) => b.value) }],
        categories: c.breakdown.map((b) => b.label),
      },
      encoding: {},
    });
  }

  // Key metric
  if (c.keyMetric) {
    blocks.push({
      id: genId("metric"),
      type: "metric" as const,
      label: c.keyMetric.label,
      value: c.keyMetric.value,
      unit: c.keyMetric.unit,
    });
  }

  if (c.insight) {
    blocks.push({
      id: genId("callout"),
      type: "callout" as const,
      text: c.insight,
      tone: "info" as const,
    });
  }

  return blocks;
}
