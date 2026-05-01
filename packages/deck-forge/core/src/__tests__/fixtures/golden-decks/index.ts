/**
 * Golden deck fixtures for visual quality evaluation.
 *
 * Each fixture exports a `BuildPresentationIrInput` so it can be piped
 * through the full pipeline: build IR → validate → repair → quality score.
 */

import type { BuildPresentationIrInput } from "#src/builders/build-presentation-ir.js";
import type { SlideIntent, LayoutIntent } from "#src/schemas/intent-artifacts.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeBrief(overrides: { id: string; title: string }) {
  return {
    id: overrides.id,
    title: overrides.title,
    audience: {
      primary: "Business stakeholders",
      expertiseLevel: "executive" as const,
    },
    goal: {
      type: "inform" as const,
      mainMessage: overrides.title,
      desiredOutcome: "Understand the content",
    },
    tone: {
      formality: "business" as const,
      energy: "confident" as const,
      technicalDepth: "medium" as const,
    },
    narrative: {
      structure: "analysis" as const,
      arc: [{ role: "insight" as const, message: "Key information" }],
    },
    output: {
      formats: ["pptx" as const],
      aspectRatio: "16:9" as const,
    },
    constraints: {},
    visualDirection: {
      style: "corporate" as const,
      mood: "trustworthy" as const,
    },
  };
}

function makeDeckPlan(overrides: {
  id: string;
  briefId: string;
  title: string;
  slides: Array<{
    id: string;
    title: string;
    intentType: SlideIntent["type"];
    layout: LayoutIntent;
  }>;
}) {
  return {
    id: overrides.id,
    briefId: overrides.briefId,
    title: overrides.title,
    slideCountTarget: overrides.slides.length,
    sections: [
      {
        id: "section-1",
        title: "Main",
        role: "proposal" as const,
        slides: overrides.slides.map((s, i) => ({
          id: s.id,
          title: s.title,
          intent: {
            type: s.intentType,
            keyMessage: s.title,
            audienceTakeaway: s.title,
          },
          expectedLayout: s.layout,
          contentRequirements: [
            { id: `cr-${s.id}-${i}`, description: "content", priority: "medium" as const },
          ],
        })),
      },
    ],
    globalStoryline: overrides.title,
  };
}

// ---------------------------------------------------------------------------
// 1. Title Deck
// ---------------------------------------------------------------------------

export const titleDeck: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-title", title: "Company All-Hands Q3" }),
  deckPlan: makeDeckPlan({
    id: "plan-title",
    briefId: "brief-title",
    title: "Company All-Hands Q3",
    slides: [
      { id: "s1", title: "Company All-Hands Q3", intentType: "title", layout: "title" },
      { id: "s2", title: "Agenda", intentType: "agenda", layout: "single_column" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Company All-Hands Q3",
      intent: { type: "title", keyMessage: "Quarterly update", audienceTakeaway: "Context" },
      layout: { type: "title", density: "low" },
      content: [
        { id: "c1", type: "title", text: "Company All-Hands Q3" },
        { id: "c2", type: "subtitle", text: "July–September 2026" },
      ],
    },
    {
      id: "s2",
      slideNumber: 2,
      title: "Agenda",
      intent: { type: "agenda", keyMessage: "Topics", audienceTakeaway: "Structure" },
      layout: { type: "single_column", density: "low" },
      content: [
        { id: "c3", type: "title", text: "Agenda" },
        {
          id: "c4",
          type: "bullet_list",
          items: [
            { text: "Revenue update" },
            { text: "Product roadmap" },
            { text: "Team growth" },
            { text: "Q4 priorities" },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Technical Proposal
// ---------------------------------------------------------------------------

export const technicalProposal: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-proposal", title: "Platform Migration Proposal" }),
  deckPlan: makeDeckPlan({
    id: "plan-proposal",
    briefId: "brief-proposal",
    title: "Platform Migration Proposal",
    slides: [
      { id: "s1", title: "Platform Migration Proposal", intentType: "title", layout: "title" },
      { id: "s2", title: "Current Challenges", intentType: "problem", layout: "single_column" },
      { id: "s3", title: "Proposed Solution", intentType: "proposal", layout: "two_column" },
      { id: "s4", title: "Implementation Timeline", intentType: "timeline", layout: "timeline" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Platform Migration Proposal",
      intent: { type: "title", keyMessage: "Migration plan", audienceTakeaway: "Overview" },
      layout: { type: "title", density: "low" },
      content: [
        { id: "c1", type: "title", text: "Platform Migration Proposal" },
        { id: "c2", type: "subtitle", text: "Engineering Team — Q3 2026" },
      ],
    },
    {
      id: "s2",
      slideNumber: 2,
      title: "Current Challenges",
      intent: { type: "problem", keyMessage: "Pain points", audienceTakeaway: "Why change" },
      layout: { type: "single_column", density: "medium" },
      content: [
        { id: "c3", type: "title", text: "Current Challenges" },
        {
          id: "c4",
          type: "bullet_list",
          items: [
            { text: "Legacy monolith limits deployment frequency" },
            { text: "Single-tenant architecture constrains scaling" },
            { text: "12-hour incident MTTR due to observability gaps" },
            { text: "Developer velocity declining quarter over quarter" },
          ],
        },
      ],
    },
    {
      id: "s3",
      slideNumber: 3,
      title: "Proposed Solution",
      intent: { type: "proposal", keyMessage: "Microservices", audienceTakeaway: "Solution" },
      layout: { type: "two_column", density: "medium" },
      content: [
        { id: "c5", type: "title", text: "Proposed Solution" },
        {
          id: "c6",
          type: "paragraph",
          text: "Migrate to event-driven microservices on Kubernetes with full observability stack. Projected 3× deployment throughput and 70% MTTR reduction.",
        },
        {
          id: "c7",
          type: "bullet_list",
          items: [
            { text: "Phase 1: Extract auth & billing services" },
            { text: "Phase 2: Event bus + async messaging" },
            { text: "Phase 3: Full decomposition" },
          ],
        },
      ],
    },
    {
      id: "s4",
      slideNumber: 4,
      title: "Implementation Timeline",
      intent: { type: "timeline", keyMessage: "Phases", audienceTakeaway: "Schedule" },
      layout: { type: "timeline", density: "medium" },
      content: [
        { id: "c8", type: "title", text: "Implementation Timeline" },
        {
          id: "c9",
          type: "bullet_list",
          items: [
            { text: "Q3: Auth + billing extraction" },
            { text: "Q4: Event bus deployment" },
            { text: "Q1 2027: Full microservice decomposition" },
            { text: "Q2 2027: Observability hardening" },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Table + Insight
// ---------------------------------------------------------------------------

export const tableInsight: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-table", title: "Segment Performance Analysis" }),
  deckPlan: makeDeckPlan({
    id: "plan-table",
    briefId: "brief-table",
    title: "Segment Performance",
    slides: [
      { id: "s1", title: "Segment Revenue", intentType: "data_insight", layout: "dashboard" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Segment Revenue",
      intent: { type: "data_insight", keyMessage: "Revenue breakdown", audienceTakeaway: "Growth areas" },
      layout: { type: "dashboard", density: "medium" },
      content: [
        { id: "c1", type: "title", text: "Segment Revenue Breakdown" },
        {
          id: "c2",
          type: "table",
          headers: ["Segment", "Revenue", "YoY Growth", "Margin"],
          rows: [
            ["Enterprise", "$4.2M", "+24%", "68%"],
            ["Mid-Market", "$2.8M", "+18%", "55%"],
            ["SMB", "$1.4M", "+11%", "42%"],
            ["Self-Serve", "$0.6M", "+45%", "81%"],
          ],
        },
        {
          id: "c3",
          type: "callout",
          text: "Enterprise and Self-Serve show strongest momentum. Self-Serve has highest margin at 81%.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Chart + Insight
// ---------------------------------------------------------------------------

export const chartInsight: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-chart", title: "Revenue Trend Analysis" }),
  deckPlan: makeDeckPlan({
    id: "plan-chart",
    briefId: "brief-chart",
    title: "Revenue Trend",
    slides: [
      { id: "s1", title: "Revenue Growth", intentType: "data_insight", layout: "two_column" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Revenue Growth",
      intent: { type: "data_insight", keyMessage: "Consistent growth", audienceTakeaway: "Trend" },
      layout: { type: "two_column", density: "medium", emphasis: "visual" },
      content: [
        { id: "c1", type: "title", text: "Revenue Growth — 12 Months" },
        {
          id: "c2",
          type: "chart",
          chartType: "line",
          data: {
            series: [
              {
                name: "Revenue",
                values: [2.1, 2.3, 2.5, 2.4, 2.7, 2.9, 3.1, 3.3, 3.2, 3.5, 3.8, 4.2],
              },
            ],
            categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
          },
          encoding: { x: "month", y: "revenue ($M)" },
          insight: "Revenue grew 100% YoY with acceleration in H2",
        },
        {
          id: "c3",
          type: "callout",
          text: "H2 acceleration driven by Enterprise segment expansion and self-serve launch in August.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. KPI / Dashboard
// ---------------------------------------------------------------------------

export const kpiDashboard: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-kpi", title: "Executive KPI Dashboard" }),
  deckPlan: makeDeckPlan({
    id: "plan-kpi",
    briefId: "brief-kpi",
    title: "KPI Dashboard",
    slides: [
      { id: "s1", title: "Key Metrics", intentType: "data_insight", layout: "dashboard" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Key Metrics",
      intent: { type: "data_insight", keyMessage: "KPIs", audienceTakeaway: "Health" },
      layout: { type: "dashboard", density: "high" },
      content: [
        { id: "c1", type: "title", text: "Q3 KPI Dashboard" },
        { id: "c2", type: "metric", label: "MRR", value: "$4.2M", trend: "up" },
        { id: "c3", type: "metric", label: "NPS", value: "72", trend: "up" },
        { id: "c4", type: "metric", label: "Churn", value: "1.8%", trend: "down" },
        { id: "c5", type: "metric", label: "ARR", value: "$50M", trend: "up" },
        { id: "c6", type: "metric", label: "CAC Payback", value: "11 mo", trend: "down" },
        { id: "c7", type: "metric", label: "LTV/CAC", value: "4.2×", trend: "up" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. Architecture Diagram
// ---------------------------------------------------------------------------

export const architectureDiagram: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-arch", title: "System Architecture" }),
  deckPlan: makeDeckPlan({
    id: "plan-arch",
    briefId: "brief-arch",
    title: "Architecture",
    slides: [
      { id: "s1", title: "Architecture Overview", intentType: "architecture", layout: "diagram_focus" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Architecture Overview",
      intent: { type: "architecture", keyMessage: "System design", audienceTakeaway: "Components" },
      layout: { type: "diagram_focus", density: "medium" },
      content: [
        { id: "c1", type: "title", text: "Platform Architecture" },
        {
          id: "c2",
          type: "diagram",
          diagramType: "flowchart",
          nodes: [
            { id: "n1", label: "API Gateway" },
            { id: "n2", label: "Auth Service" },
            { id: "n3", label: "Core API" },
            { id: "n4", label: "Event Bus" },
            { id: "n5", label: "Worker Pool" },
            { id: "n6", label: "Database" },
          ],
          edges: [
            { id: "e1", from: "n1", to: "n2", label: "authenticate" },
            { id: "e2", from: "n1", to: "n3", label: "route" },
            { id: "e3", from: "n3", to: "n4", label: "publish" },
            { id: "e4", from: "n4", to: "n5", label: "consume" },
            { id: "e5", from: "n3", to: "n6", label: "read/write" },
            { id: "e6", from: "n5", to: "n6", label: "read/write" },
          ],
        },
        {
          id: "c3",
          type: "paragraph",
          text: "All inter-service communication flows through the event bus, enabling loose coupling and independent scaling.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 7. Comparison
// ---------------------------------------------------------------------------

export const comparison: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-compare", title: "Build vs Buy Analysis" }),
  deckPlan: makeDeckPlan({
    id: "plan-compare",
    briefId: "brief-compare",
    title: "Build vs Buy",
    slides: [
      { id: "s1", title: "Build vs Buy", intentType: "comparison", layout: "comparison" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "Build vs Buy",
      intent: { type: "comparison", keyMessage: "Trade-offs", audienceTakeaway: "Decision factors" },
      layout: { type: "comparison", density: "medium" },
      content: [
        { id: "c1", type: "title", text: "Build vs Buy: Authentication" },
        {
          id: "c2",
          type: "table",
          headers: ["Factor", "Build", "Buy"],
          rows: [
            ["Time to market", "3–4 months", "2 weeks"],
            ["Annual cost", "$180K (eng time)", "$48K (license)"],
            ["Customization", "Full control", "Limited"],
            ["Maintenance", "Ongoing eng cost", "Vendor managed"],
            ["Compliance", "Self-managed", "Certified (SOC2, GDPR)"],
          ],
        },
        {
          id: "c3",
          type: "callout",
          text: "Recommendation: Buy. Net savings of $132K/year with faster time to market and built-in compliance.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// 8. Timeline
// ---------------------------------------------------------------------------

export const timeline: BuildPresentationIrInput = {
  brief: makeBrief({ id: "brief-timeline", title: "Product Roadmap" }),
  deckPlan: makeDeckPlan({
    id: "plan-timeline",
    briefId: "brief-timeline",
    title: "Roadmap",
    slides: [
      { id: "s1", title: "2026 Roadmap", intentType: "timeline", layout: "timeline" },
    ],
  }),
  slideSpecs: [
    {
      id: "s1",
      slideNumber: 1,
      title: "2026 Roadmap",
      intent: { type: "timeline", keyMessage: "Milestones", audienceTakeaway: "Schedule" },
      layout: { type: "timeline", density: "medium" },
      content: [
        { id: "c1", type: "title", text: "2026 Product Roadmap" },
        {
          id: "c2",
          type: "bullet_list",
          items: [
            { text: "Q1: Multi-tenant platform launch" },
            { text: "Q2: Self-serve onboarding + billing" },
            { text: "Q3: AI-powered analytics" },
            { text: "Q4: International expansion (EU, APAC)" },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Barrel export
// ---------------------------------------------------------------------------

export const goldenDecks: Record<string, BuildPresentationIrInput> = {
  "title-deck": titleDeck,
  "technical-proposal": technicalProposal,
  "table-insight": tableInsight,
  "chart-insight": chartInsight,
  "kpi-dashboard": kpiDashboard,
  "architecture-diagram": architectureDiagram,
  comparison,
  timeline,
};
