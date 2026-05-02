/**
 * Built-in strategy manifests for all registered layout strategies.
 *
 * Canonical manifest fields (name, description, chooseWhen, avoidWhen) are
 * in English to serve as machine-readable metadata for Strategy Selectors.
 */

import type { StrategyManifest } from "#src/strategy/manifest.js";

// ---------------------------------------------------------------------------
// kpi-card-overview
// ---------------------------------------------------------------------------
export const kpiCardOverviewManifest: StrategyManifest = {
  id: "kpi-card-overview",
  name: "KPI Card Overview",
  description: "Presents a compact overview of key metrics using KPI cards, optimized for quick status scanning.",
  suitableFor: ["executive-summary", "business-review", "manufacturing-operations", "data-analytics-report"],
  audiences: ["executive", "manager", "operator"],
  intents: ["summarize", "report"],
  contentKinds: ["kpi", "summary"],
  density: "medium",
  chooseWhen: [
    "Use when 3–6 metrics need to be reviewed on one slide.",
    "Use when the audience needs to quickly judge whether the current state is good or bad.",
    "Use when a current snapshot matters more than a time-series trend.",
  ],
  avoidWhen: [
    "Avoid when there are more than 6 metrics.",
    "Avoid when a large chart should be the primary focus.",
    "Avoid when long explanatory text is required.",
  ],
  capabilities: { supportsCharts: false, supportsIcons: true },
  limits: { minItems: 3, maxItems: 6, maxTextLength: 120 },
};

// ---------------------------------------------------------------------------
// kpi-dashboard-with-insight
// ---------------------------------------------------------------------------
export const kpiDashboardWithInsightManifest: StrategyManifest = {
  id: "kpi-dashboard-with-insight",
  name: "KPI Dashboard with Insight",
  description: "Combines KPI cards, a trend chart, and a concise insight panel to explain both status and interpretation.",
  suitableFor: ["business-review", "data-analytics-report", "manufacturing-operations"],
  audiences: ["executive", "manager", "operator"],
  intents: ["report", "summarize", "decide"],
  contentKinds: ["kpi", "chart", "summary"],
  density: "high",
  chooseWhen: [
    "Use when metrics, trends, and interpretation must be shown together.",
    "Use when the slide should explain not only what changed, but why it matters.",
    "Use when a management or operations review needs both status and insight.",
  ],
  avoidWhen: [
    "Avoid when only KPI cards are needed without a chart.",
    "Avoid when there are fewer than 2 metrics.",
    "Avoid when the slide should focus on a single large visualization.",
  ],
  capabilities: { supportsCharts: true, supportsIcons: true },
  limits: { minItems: 2, maxItems: 6, maxTextLength: 150 },
};

// ---------------------------------------------------------------------------
// decision-request
// ---------------------------------------------------------------------------
export const decisionRequestManifest: StrategyManifest = {
  id: "decision-request",
  name: "Decision Request",
  description: "Presents approval items with supporting KPI context and a clear call-to-action for decision-makers.",
  suitableFor: ["executive-summary", "business-review", "product-roadmap"],
  audiences: ["executive", "manager"],
  intents: ["decide", "persuade"],
  contentKinds: ["decision", "action-plan"],
  density: "medium",
  chooseWhen: [
    "Use when an approval or decision is needed from the audience.",
    "Use when supporting evidence must be compact so focus stays on the ask.",
    "Use when a clear call-to-action must close the slide.",
  ],
  avoidWhen: [
    "Avoid when the slide is purely informational with no decision required.",
    "Avoid when there are more than 4 options to evaluate.",
    "Avoid when deep technical explanation is the primary content.",
  ],
  capabilities: { supportsIcons: true },
  limits: { minItems: 1, maxItems: 6, maxTextLength: 200 },
};

// ---------------------------------------------------------------------------
// recommendation-comparison
// ---------------------------------------------------------------------------
export const recommendationComparisonManifest: StrategyManifest = {
  id: "recommendation-comparison",
  name: "Recommendation Comparison",
  description: "Compares 2–3 options side by side with a clearly highlighted recommendation.",
  suitableFor: ["executive-summary", "business-review", "sales-proposal", "engineering-design-review"],
  audiences: ["executive", "manager", "engineer"],
  intents: ["compare", "decide", "persuade"],
  contentKinds: ["comparison", "decision"],
  density: "medium",
  chooseWhen: [
    "Use when 2–3 options need to be compared with a clear winner.",
    "Use when the recommendation must stand out visually.",
    "Use when evaluation criteria should be shown as a table or matrix.",
  ],
  avoidWhen: [
    "Avoid when there is only one option.",
    "Avoid when comparison axes are unclear or subjective.",
    "Avoid when raw quantitative data is the primary content.",
  ],
  capabilities: { supportsTables: true, supportsIcons: true },
  limits: { minItems: 2, maxItems: 4, maxColumns: 4 },
};

// ---------------------------------------------------------------------------
// action-plan-table
// ---------------------------------------------------------------------------
export const actionPlanTableManifest: StrategyManifest = {
  id: "action-plan-table",
  name: "Action Plan Table",
  description: "Lists action items in a structured table with owner, deadline, and status columns.",
  suitableFor: ["business-review", "product-roadmap", "incident-review", "manufacturing-operations"],
  audiences: ["manager", "engineer", "operator"],
  intents: ["plan", "report", "review"],
  contentKinds: ["action-plan", "table"],
  density: "high",
  chooseWhen: [
    "Use when concrete action items need to be enumerated.",
    "Use when ownership, deadlines, and progress must be tracked visually.",
    "Use when the audience needs to know exactly what happens next.",
  ],
  avoidWhen: [
    "Avoid when there is only one action item.",
    "Avoid when the content is conceptual rather than actionable.",
    "Avoid when the slide is primarily visual or chart-driven.",
  ],
  capabilities: { supportsTables: true },
  limits: { minItems: 2, maxItems: 8, maxColumns: 5 },
};

// ---------------------------------------------------------------------------
// process-flow-with-impact
// ---------------------------------------------------------------------------
export const processFlowWithImpactManifest: StrategyManifest = {
  id: "process-flow-with-impact",
  name: "Process Flow with Impact",
  description: "Visualizes a left-to-right process with impact or bottleneck annotations per step.",
  suitableFor: ["manufacturing-operations", "engineering-design-review", "business-review", "incident-review"],
  audiences: ["manager", "engineer", "operator"],
  intents: ["explain", "diagnose", "plan"],
  contentKinds: ["process", "flow"],
  density: "medium",
  chooseWhen: [
    "Use when 3–6 process steps need to be shown in sequence.",
    "Use when bottlenecks or improvement points should be highlighted.",
    "Use when causal flow is the primary message.",
  ],
  avoidWhen: [
    "Avoid when there are fewer than 3 steps.",
    "Avoid when the process is heavily parallel rather than sequential.",
    "Avoid when time-series data is more important than flow.",
  ],
  capabilities: { supportsIcons: true },
  limits: { minItems: 3, maxItems: 6 },
};

// ---------------------------------------------------------------------------
// implementation-roadmap
// ---------------------------------------------------------------------------
export const implementationRoadmapManifest: StrategyManifest = {
  id: "implementation-roadmap",
  name: "Implementation Roadmap",
  description: "Lays out phased milestones along a horizontal timeline for project planning and progress tracking.",
  suitableFor: ["product-roadmap", "business-review", "engineering-design-review"],
  audiences: ["executive", "manager", "engineer"],
  intents: ["plan", "report", "explain"],
  contentKinds: ["timeline", "action-plan"],
  density: "medium",
  chooseWhen: [
    "Use when a phased plan with milestones needs to be communicated.",
    "Use when progress across multiple phases should be shown at a glance.",
    "Use when the audience needs to understand delivery sequence.",
  ],
  avoidWhen: [
    "Avoid when timeframes are unclear or undefined.",
    "Avoid when there are fewer than 3 milestones.",
    "Avoid when day-level scheduling detail is required.",
  ],
  capabilities: { supportsIcons: true },
  limits: { minItems: 3, maxItems: 8 },
};

// ---------------------------------------------------------------------------
// layered-architecture
// ---------------------------------------------------------------------------
export const layeredArchitectureManifest: StrategyManifest = {
  id: "layered-architecture",
  name: "Layered Architecture",
  description: "Depicts a system as vertically stacked layers to show separation of concerns and dependencies.",
  suitableFor: ["technical-architecture", "engineering-design-review"],
  audiences: ["engineer", "manager"],
  intents: ["explain", "review"],
  contentKinds: ["architecture"],
  density: "medium",
  chooseWhen: [
    "Use when the system is best explained as a stack of layers.",
    "Use when dependencies or responsibilities are organized vertically.",
    "Use when the audience needs to understand architectural separation of concerns.",
  ],
  avoidWhen: [
    "Avoid when request or data flow is the primary message.",
    "Avoid when there are fewer than three meaningful layers.",
    "Avoid when a non-technical conceptual overview would be clearer.",
  ],
  capabilities: { supportsIcons: true, supportsImages: true },
  limits: { minItems: 2, maxItems: 6 },
};

// ---------------------------------------------------------------------------
// data-insight-story
// ---------------------------------------------------------------------------
export const dataInsightStoryManifest: StrategyManifest = {
  id: "data-insight-story",
  name: "Data Insight Story",
  description: "Pairs a visual analysis result with a concise insight so the audience understands the key finding and its implication.",
  suitableFor: ["data-analytics-report", "research-presentation", "business-review"],
  audiences: ["executive", "manager", "researcher"],
  intents: ["explain", "summarize", "report"],
  contentKinds: ["chart", "research-result", "summary"],
  density: "medium",
  chooseWhen: [
    "Use when a chart or analysis result needs to be paired with an explanation.",
    "Use when the key message is a data-driven conclusion.",
    "Use when a visual-plus-insight layout best conveys the finding.",
  ],
  avoidWhen: [
    "Avoid when the slide needs a full root-cause chain or fishbone-style analysis.",
    "Avoid when multiple charts must be compared side by side.",
    "Avoid when a table is the clearest way to present the evidence.",
  ],
  capabilities: { supportsCharts: true, supportsImages: true },
  limits: { maxTextLength: 300 },
};

// ---------------------------------------------------------------------------
// small-multiples-trend
// ---------------------------------------------------------------------------
export const smallMultiplesTrendManifest: StrategyManifest = {
  id: "small-multiples-trend",
  name: "Small Multiples Trend",
  description: "Arranges multiple small charts side by side so the audience can compare trends across series.",
  suitableFor: ["data-analytics-report", "manufacturing-operations", "business-review"],
  audiences: ["manager", "engineer", "researcher"],
  intents: ["compare", "report"],
  contentKinds: ["chart", "kpi"],
  density: "high",
  chooseWhen: [
    "Use when 2–4 time-series need to be compared in parallel.",
    "Use when small-multiples layout is the most readable form.",
    "Use when each metric's trend matters individually and collectively.",
  ],
  avoidWhen: [
    "Avoid when there is only one series.",
    "Avoid when there are 5 or more series.",
    "Avoid when absolute-value comparison is more important than trend.",
  ],
  capabilities: { supportsCharts: true },
  limits: { minItems: 2, maxItems: 4 },
};

// ---------------------------------------------------------------------------
// option-comparison-table
// ---------------------------------------------------------------------------
export const optionComparisonTableManifest: StrategyManifest = {
  id: "option-comparison-table",
  name: "Option Comparison Table",
  description: "Evaluates multiple options against criteria in a structured table format.",
  suitableFor: ["executive-summary", "engineering-design-review", "sales-proposal"],
  audiences: ["executive", "manager", "engineer"],
  intents: ["compare", "decide"],
  contentKinds: ["comparison", "table"],
  density: "high",
  chooseWhen: [
    "Use when 3 or more evaluation axes are needed to compare options.",
    "Use when a table is the clearest representation.",
    "Use when both qualitative and quantitative criteria are mixed.",
  ],
  avoidWhen: [
    "Avoid when there is only one option.",
    "Avoid when evaluation criteria are unclear.",
    "Avoid when a highlighted recommendation is more important than balanced comparison.",
  ],
  capabilities: { supportsTables: true },
  limits: { minItems: 2, maxItems: 5, maxColumns: 6 },
};

// ---------------------------------------------------------------------------
// one-message-summary
// ---------------------------------------------------------------------------
export const oneMessageSummaryManifest: StrategyManifest = {
  id: "one-message-summary",
  name: "One Message Summary",
  description: "Centers a single bold takeaway message with minimal supporting context for maximum impact.",
  suitableFor: ["executive-summary", "sales-proposal", "training"],
  audiences: ["executive", "customer", "general"],
  intents: ["summarize", "persuade"],
  contentKinds: ["summary"],
  density: "low",
  chooseWhen: [
    "Use when one sentence must carry the entire slide.",
    "Use when impact and memorability outweigh information density.",
    "Use when the audience should leave with exactly one takeaway.",
  ],
  avoidWhen: [
    "Avoid when multiple pieces of information must be conveyed.",
    "Avoid when data or evidence is required on the same slide.",
    "Avoid when there are several equally important points.",
  ],
  capabilities: { supportsIcons: true },
  limits: { maxTextLength: 80 },
};

// ---------------------------------------------------------------------------
// three-point-summary
// ---------------------------------------------------------------------------
export const threePointSummaryManifest: StrategyManifest = {
  id: "three-point-summary",
  name: "Three Point Summary",
  description: "Presents exactly three key points in evenly weighted columns or rows for balanced emphasis.",
  suitableFor: ["executive-summary", "training", "sales-proposal", "business-review"],
  audiences: ["executive", "manager", "customer", "general"],
  intents: ["summarize", "explain", "teach"],
  contentKinds: ["summary"],
  density: "low",
  chooseWhen: [
    "Use when exactly three takeaways or pillars need to be communicated.",
    "Use when brevity and memorability are more important than depth.",
    "Use when the slide serves as a recap or executive summary.",
  ],
  avoidWhen: [
    "Avoid when there are more than three equally important points.",
    "Avoid when each point requires extensive explanation.",
    "Avoid when data visualization is the primary content.",
  ],
  capabilities: { supportsIcons: true },
  limits: { minItems: 3, maxItems: 3, maxTextLength: 150 },
};

// ---------------------------------------------------------------------------
// two-column-comparison
// ---------------------------------------------------------------------------
export const twoColumnComparisonManifest: StrategyManifest = {
  id: "two-column-comparison",
  name: "Two-column Comparison",
  description: "Compares two items side by side using a clear two-column structure.",
  suitableFor: ["business-review", "engineering-design-review", "sales-proposal", "training"],
  audiences: ["executive", "manager", "engineer", "customer"],
  intents: ["compare", "explain"],
  contentKinds: ["comparison"],
  density: "medium",
  chooseWhen: [
    "Use when exactly two items need Before/After or A/B comparison.",
    "Use when a left-right split makes the difference immediately obvious.",
  ],
  avoidWhen: [
    "Avoid when there are 3 or more items to compare (use option-comparison-table).",
    "Avoid when a table with multiple criteria is clearer.",
  ],
  capabilities: {},
  limits: { minItems: 2, maxItems: 2 },
};

// ---------------------------------------------------------------------------
// event-timeline
// ---------------------------------------------------------------------------
export const eventTimelineManifest: StrategyManifest = {
  id: "event-timeline",
  name: "Event Timeline",
  description: "Shows events or milestones in chronological order when the sequence of time is the main message.",
  suitableFor: ["product-roadmap", "business-review", "incident-review", "research-presentation"],
  audiences: ["executive", "manager", "engineer", "researcher"],
  intents: ["plan", "report", "explain"],
  contentKinds: ["timeline"],
  density: "medium",
  chooseWhen: [
    "Use when a chronological sequence of events must be communicated.",
    "Use when the timeline is lighter than a full implementation roadmap.",
    "Use when incident chronology or research schedule is the subject.",
  ],
  avoidWhen: [
    "Avoid when there are fewer than 3 events.",
    "Avoid when causal relationships matter more than timing (use process-flow).",
  ],
  capabilities: {},
  limits: { minItems: 3, maxItems: 8 },
};

// ---------------------------------------------------------------------------
// metric-tile-dashboard
// ---------------------------------------------------------------------------
export const metricTileDashboardManifest: StrategyManifest = {
  id: "metric-tile-dashboard",
  name: "Metric Tile Dashboard",
  description: "Arranges multiple metric or status tiles in a grid when breadth and scanability matter more than narrative explanation.",
  suitableFor: ["business-review", "manufacturing-operations", "data-analytics-report"],
  audiences: ["executive", "manager", "operator"],
  intents: ["report", "summarize"],
  contentKinds: ["kpi", "summary"],
  density: "high",
  chooseWhen: [
    "Use when many metrics or status items must be scanned at once.",
    "Use when breadth and monitoring-style overview are more important than a narrative story.",
    "Use when the slide needs a grid of compact tiles rather than a chart-led layout.",
  ],
  avoidWhen: [
    "Avoid when there are only 3–4 metrics and a simpler KPI card overview would be clearer.",
    "Avoid when interpretation or a trend chart is required.",
    "Avoid when the slide needs a strong single takeaway.",
  ],
  capabilities: { supportsCharts: true, supportsIcons: true },
  limits: { minItems: 4, maxItems: 9 },
};

// ---------------------------------------------------------------------------
// two-axis-matrix
// ---------------------------------------------------------------------------
export const twoAxisMatrixManifest: StrategyManifest = {
  id: "two-axis-matrix",
  name: "Two-axis Matrix",
  description: "Places items on a two-axis matrix to support prioritization, classification, or positioning.",
  suitableFor: ["business-review", "engineering-design-review", "research-presentation"],
  audiences: ["executive", "manager", "engineer", "researcher"],
  intents: ["compare", "explain", "decide"],
  contentKinds: ["comparison", "risk"],
  density: "medium",
  chooseWhen: [
    "Use when items need to be classified along two independent axes.",
    "Use when a priority or risk matrix is the best visualization.",
    "Use when positioning or quadrant placement conveys the message.",
  ],
  avoidWhen: [
    "Avoid when the two axes are unclear or not independent.",
    "Avoid when there are fewer than 3 items to place.",
    "Avoid when a one-dimensional comparison is sufficient.",
  ],
  capabilities: {},
  limits: { minItems: 3, maxItems: 12 },
};
