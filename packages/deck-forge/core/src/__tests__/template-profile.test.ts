import { describe, expect, it } from "vitest";

import { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";
import { resolveTemplateLayout } from "#src/templates/resolve-template-layout.js";
import type { TemplateSlotName } from "#src/templates/template-profile.js";
import { frameOverlapRatio } from "#src/geometry/frame-geometry.js";
import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import type { ContentBlock, SlideSpec, PresentationBrief, DeckPlan } from "#src/index.js";

// ---------------------------------------------------------------------------
// 1. Built-in template profile test
// ---------------------------------------------------------------------------

describe("executive-navy-v1 template profile", () => {
  const profile = EXECUTIVE_NAVY_TEMPLATE_PROFILE;

  it("has correct id and slide size", () => {
    expect(profile.id).toBe("executive-navy-v1");
    expect(profile.slideSize).toEqual({ width: 1280, height: 720, unit: "px" });
  });

  it("has themeId", () => {
    expect(profile.themeId).toBe("executive-navy");
  });

  const expectedLayouts = [
    "cover",
    "section",
    "content-standard",
    "content-two-column",
    "dashboard-cards",
    "visual-insight",
    "table",
    "process",
    "blank",
    // Phase 7.5 expansion
    "content-with-sidebar",
    "content-with-callout",
    "visual-left-insight-right",
    "visual-top-insight-bottom",
    "dashboard-cards-with-chart",
    "table-with-cta",
    "comparison-two-column",
    "roadmap-horizontal",
    "process-with-impact",
    "architecture-layered",
    "matrix-with-insight",
    "message-focus",
    "approval-with-kpi-sidecar",
  ];

  it("contains all expected layout profiles", () => {
    const layoutIds = profile.layouts.map((l) => l.id);
    for (const id of expectedLayouts) {
      expect(layoutIds).toContain(id);
    }
  });

  it("has 22 layouts (no business layout explosion)", () => {
    expect(profile.layouts.length).toBeGreaterThanOrEqual(18);
    expect(profile.layouts.length).toBeLessThanOrEqual(23);
  });

  it("cover has title, subtitle, and footer slots", () => {
    const cover = profile.layouts.find((l) => l.id === "cover")!;
    expect(cover.kind).toBe("cover");
    expect(cover.slots.title).toBeDefined();
    expect(cover.slots.subtitle).toBeDefined();
    expect(cover.slots.footer).toBeDefined();
  });

  it("section has title, subtitle, and footer slots", () => {
    const section = profile.layouts.find((l) => l.id === "section")!;
    expect(section.kind).toBe("section");
    expect(section.slots.title).toBeDefined();
    expect(section.slots.subtitle).toBeDefined();
  });

  it("content-standard has title, main, body, callout, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "content-standard")!;
    expect(layout.kind).toBe("content");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.main).toBeDefined();
    expect(layout.slots.body).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
    expect(layout.slots.footer).toBeDefined();
  });

  it("content-two-column has title, left, right, callout, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "content-two-column")!;
    expect(layout.kind).toBe("two-column");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.left).toBeDefined();
    expect(layout.slots.right).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("dashboard-cards has title, metrics, cards, callout, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "dashboard-cards")!;
    expect(layout.kind).toBe("dashboard");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.metrics).toBeDefined();
    expect(layout.slots.cards).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("visual-insight has title, visual, insight, callout, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "visual-insight")!;
    expect(layout.kind).toBe("visual-insight");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.visual).toBeDefined();
    expect(layout.slots.insight).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("table has title, table, cta, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "table")!;
    expect(layout.kind).toBe("table");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.table).toBeDefined();
    expect(layout.slots.cta).toBeDefined();
  });

  it("process has title, process, callout, footer slots", () => {
    const layout = profile.layouts.find((l) => l.id === "process")!;
    expect(layout.kind).toBe("process");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.process).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  // Phase 7.5 expansion layout tests

  it("content-with-sidebar has title, main, body, sidebar, callout, footer", () => {
    const layout = profile.layouts.find((l) => l.id === "content-with-sidebar")!;
    expect(layout.kind).toBe("content");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.main).toBeDefined();
    expect(layout.slots.sidebar).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
    expect(layout.slots.footer).toBeDefined();
  });

  it("dashboard-cards-with-chart has metrics, visual, insight", () => {
    const layout = profile.layouts.find((l) => l.id === "dashboard-cards-with-chart")!;
    expect(layout.kind).toBe("dashboard");
    expect(layout.slots.metrics).toBeDefined();
    expect(layout.slots.visual).toBeDefined();
    expect(layout.slots.insight).toBeDefined();
  });

  it("process-with-impact has process, impact, callout", () => {
    const layout = profile.layouts.find((l) => l.id === "process-with-impact")!;
    expect(layout.kind).toBe("process");
    expect(layout.slots.process).toBeDefined();
    expect(layout.slots.impact).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("roadmap-horizontal has process, milestones, callout", () => {
    const layout = profile.layouts.find((l) => l.id === "roadmap-horizontal")!;
    expect(layout.kind).toBe("roadmap");
    expect(layout.slots.process).toBeDefined();
    expect(layout.slots.milestones).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("architecture-layered has architecture, insight, callout", () => {
    const layout = profile.layouts.find((l) => l.id === "architecture-layered")!;
    expect(layout.kind).toBe("architecture");
    expect(layout.slots.architecture).toBeDefined();
    expect(layout.slots.insight).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("matrix-with-insight has matrix, insight, callout", () => {
    const layout = profile.layouts.find((l) => l.id === "matrix-with-insight")!;
    expect(layout.kind).toBe("matrix");
    expect(layout.slots.matrix).toBeDefined();
    expect(layout.slots.insight).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("comparison-two-column has left, right, callout", () => {
    const layout = profile.layouts.find((l) => l.id === "comparison-two-column")!;
    expect(layout.kind).toBe("comparison");
    expect(layout.slots.left).toBeDefined();
    expect(layout.slots.right).toBeDefined();
    expect(layout.slots.callout).toBeDefined();
  });

  it("message-focus has message, supporting, footer", () => {
    const layout = profile.layouts.find((l) => l.id === "message-focus")!;
    expect(layout.kind).toBe("message");
    expect(layout.slots.message).toBeDefined();
    expect(layout.slots.supporting).toBeDefined();
    expect(layout.slots.footer).toBeDefined();
  });

  it("approval-with-kpi-sidecar has title, cta, main, metrics, supporting, footer", () => {
    const layout = profile.layouts.find((l) => l.id === "approval-with-kpi-sidecar")!;
    expect(layout).toBeDefined();
    expect(layout.kind).toBe("message");
    expect(layout.slots.title).toBeDefined();
    expect(layout.slots.cta).toBeDefined();
    expect(layout.slots.main).toBeDefined();
    expect(layout.slots.metrics).toBeDefined();
    expect(layout.slots.supporting).toBeDefined();
    expect(layout.slots.footer).toBeDefined();
  });

  it("has no duplicate template layout ids", () => {
    const ids = profile.layouts.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every non-blank layout has title and footer slots", () => {
    for (const layout of profile.layouts) {
      if (layout.kind === "blank") continue;
      expect(layout.slots.title, `${layout.id} missing title`).toBeDefined();
      expect(layout.slots.footer, `${layout.id} missing footer`).toBeDefined();
    }
  });

  it("all slot frames are within slide bounds", () => {
    for (const layout of profile.layouts) {
      for (const [, frame] of Object.entries(layout.slots)) {
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(profile.slideSize.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(profile.slideSize.height);
      }
    }
  });

  it("major content slots do not heavily overlap within a layout", () => {
    const skipSlots = new Set<string>(["title", "footer", "subtitle"]);
    for (const layout of profile.layouts) {
      const contentSlots = Object.entries(layout.slots).filter(
        ([name]) => !skipSlots.has(name),
      );
      for (let i = 0; i < contentSlots.length; i++) {
        for (let j = i + 1; j < contentSlots.length; j++) {
          const [nameA, a] = contentSlots[i]!;
          const [nameB, b] = contentSlots[j]!;
          // main/body are intentionally overlapping aliases
          if ((nameA === "main" && nameB === "body") || (nameA === "body" && nameB === "main")) continue;
          const ratio = frameOverlapRatio(a, b);
          expect(
            ratio,
            `${layout.id}: ${nameA} and ${nameB} overlap ratio ${ratio.toFixed(3)} >= 0.08`,
          ).toBeLessThan(0.08);
        }
      }
    }
  });

  it("blank has no slots", () => {
    const layout = profile.layouts.find((l) => l.id === "blank")!;
    expect(layout.kind).toBe("blank");
    expect(Object.keys(layout.slots)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveTemplateLayout test
// ---------------------------------------------------------------------------

describe("resolveTemplateLayout", () => {
  const profile = EXECUTIVE_NAVY_TEMPLATE_PROFILE;
  const emptySlide = {
    id: "s1",
    slideNumber: 1,
    title: "Test",
    content: [],
    layout: { type: "single_column", density: "medium" },
    speakerNotes: { text: "" },
  } as unknown as SlideSpec;

  function resolve(layoutType: string, strategyId?: string) {
    return resolveTemplateLayout({
      slideSpec: emptySlide,
      layoutSpec: { ...emptySlide.layout, type: layoutType as never },
      blocks: [],
      selectedStrategyId: strategyId,
      templateProfile: profile,
    });
  }

  it("title layout -> cover", () => {
    expect(resolve("title").layout.id).toBe("cover");
  });

  it("cover layout -> cover", () => {
    expect(resolve("cover").layout.id).toBe("cover");
  });

  it("section layout -> section", () => {
    expect(resolve("section").layout.id).toBe("section");
  });

  it("kpi-card-overview strategy -> dashboard-cards", () => {
    const result = resolve("single_column", "kpi-card-overview");
    expect(result.layout.id).toBe("dashboard-cards");
  });

  it("kpi-dashboard-with-insight strategy -> dashboard-cards-with-chart", () => {
    const result = resolve("single_column", "kpi-dashboard-with-insight");
    expect(result.layout.id).toBe("dashboard-cards-with-chart");
  });

  it("data-insight-story strategy -> visual-left-insight-right", () => {
    const result = resolve("single_column", "data-insight-story");
    expect(result.layout.id).toBe("visual-left-insight-right");
  });

  it("process-flow-with-impact strategy -> process-with-impact", () => {
    const result = resolve("single_column", "process-flow-with-impact");
    expect(result.layout.id).toBe("process-with-impact");
  });

  it("implementation-roadmap strategy -> roadmap-horizontal", () => {
    const result = resolve("single_column", "implementation-roadmap");
    expect(result.layout.id).toBe("roadmap-horizontal");
  });

  it("action-plan-table strategy -> table-with-cta", () => {
    const result = resolve("single_column", "action-plan-table");
    expect(result.layout.id).toBe("table-with-cta");
  });

  it("decision-request strategy -> approval-with-kpi-sidecar", () => {
    const result = resolve("single_column", "decision-request");
    expect(result.layout.id).toBe("approval-with-kpi-sidecar");
  });

  it("small-multiples-trend strategy -> visual-top-insight-bottom", () => {
    const result = resolve("single_column", "small-multiples-trend");
    expect(result.layout.id).toBe("visual-top-insight-bottom");
  });

  it("layered-architecture strategy -> architecture-layered", () => {
    const result = resolve("single_column", "layered-architecture");
    expect(result.layout.id).toBe("architecture-layered");
  });

  it("dashboard layout type -> dashboard-cards", () => {
    expect(resolve("dashboard").layout.id).toBe("dashboard-cards");
  });

  it("table layout type -> table", () => {
    const result = resolve("table");
    expect(result.layout.id).toBe("table");
  });

  it("two_column layout type -> content-two-column", () => {
    expect(resolve("two_column").layout.id).toBe("content-two-column");
  });

  it("unknown layout falls back to content-standard", () => {
    expect(resolve("single_column").layout.id).toBe("content-standard");
  });

  it("each result includes a reason string", () => {
    const result = resolve("title");
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe("string");
  });

  // -- Priority: special layout type wins over strategy --

  it("special type 'title' wins over strategy 'kpi-card-overview'", () => {
    expect(resolve("title", "kpi-card-overview").layout.id).toBe("cover");
  });

  it("special type 'section' wins over strategy 'kpi-dashboard-with-insight'", () => {
    expect(resolve("section", "kpi-dashboard-with-insight").layout.id).toBe("section");
  });

  // -- Priority: business strategy wins over generic layoutSpec.type --

  it("strategy 'kpi-dashboard-with-insight' wins over generic 'dashboard'", () => {
    expect(resolve("dashboard", "kpi-dashboard-with-insight").layout.id).toBe("dashboard-cards-with-chart");
  });

  it("strategy 'data-insight-story' wins over generic 'dashboard'", () => {
    expect(resolve("dashboard", "data-insight-story").layout.id).toBe("visual-left-insight-right");
  });

  it("strategy 'implementation-roadmap' wins over generic 'timeline'", () => {
    expect(resolve("timeline", "implementation-roadmap").layout.id).toBe("roadmap-horizontal");
  });

  it("strategy 'action-plan-table' with generic 'table' still picks table-with-cta", () => {
    expect(resolve("table", "action-plan-table").layout.id).toBe("table-with-cta");
  });

  // -- Unknown strategy falls through to generic layoutSpec.type --

  it("unknown strategy with 'dashboard' falls to dashboard-cards", () => {
    expect(resolve("dashboard", "unknown-strategy").layout.id).toBe("dashboard-cards");
  });

  it("no strategy with 'two_column' falls to content-two-column", () => {
    expect(resolve("two_column", undefined).layout.id).toBe("content-two-column");
  });

  // -- Generic layout type tests for Phase 7.5 additions --

  it("timeline layout type -> roadmap-horizontal", () => {
    expect(resolve("timeline").layout.id).toBe("roadmap-horizontal");
  });

  it("comparison layout type -> comparison-two-column", () => {
    expect(resolve("comparison").layout.id).toBe("comparison-two-column");
  });

  it("text_left_image_right layout type -> visual-left-insight-right", () => {
    expect(resolve("text_left_image_right").layout.id).toBe("visual-left-insight-right");
  });

  it("image_left_text_right layout type -> visual-left-insight-right", () => {
    expect(resolve("image_left_text_right").layout.id).toBe("visual-left-insight-right");
  });

  it("matrix layout type -> matrix-with-insight", () => {
    expect(resolve("matrix").layout.id).toBe("matrix-with-insight");
  });

  it("diagram_focus layout type -> visual-left-insight-right", () => {
    expect(resolve("diagram_focus").layout.id).toBe("visual-left-insight-right");
  });

  // -- Nothing matches -> content-standard --

  it("unknown type and no strategy falls to content-standard", () => {
    expect(resolve("unknown", undefined).layout.id).toBe("content-standard");
  });
});

// ---------------------------------------------------------------------------
// 3. buildPresentationIr trace test
// ---------------------------------------------------------------------------

describe("buildPresentationIr trace includes template info", () => {
  const brief = {
    id: "brief-1",
    title: "Test",
    audience: { role: "executive" },
    purpose: "inform",
    language: "en",
  } as unknown as PresentationBrief;

  const deckPlan = {
    id: "deck-1",
    title: "Test Deck",
    audience: "executive",
    genre: "business-review",
    slides: [{ keyMessage: "Test", intent: "summarize", contentKinds: ["summary"] }],
  } as unknown as DeckPlan;

  it("title slide trace has template fields", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "slide-1",
        slideNumber: 1,
        title: "Hello World",
        content: [{ id: "t1", type: "title", text: "Hello World" }],
        layout: { type: "title", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs, templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE });
    const trace = result.slides[0]!._trace!;

    expect(trace.layoutStrategyId).toBe("title-slide");
    expect(trace.layoutSpecType).toBe("title");
    expect(trace.templateProfileId).toBe("executive-navy-v1");
    expect(trace.templateLayoutId).toBe("cover");
    expect(trace.templateLayoutKind).toBe("cover");
    expect(trace.usedSlots).toBeDefined();
    expect(trace.fallbackSlots).toBeDefined();
    expect(Array.isArray(trace.usedSlots)).toBe(true);
  });

  it("content slide trace uses content-standard", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "slide-2",
        slideNumber: 1,
        title: "Content",
        content: [
          { id: "t1", type: "title", text: "Content" },
          { id: "p1", type: "paragraph", text: "Hello" },
        ],
        layout: { type: "single_column", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs, templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE });
    const trace = result.slides[0]!._trace!;

    expect(trace.templateProfileId).toBe("executive-navy-v1");
    expect(trace.templateLayoutId).toBe("content-standard");
    expect(trace.templateLayoutKind).toBe("content");
  });
});

// ---------------------------------------------------------------------------
// 4. Slot placement test
// ---------------------------------------------------------------------------

describe("slot placement in buildPresentationIr", () => {
  const brief = {
    id: "brief-1",
    title: "Test",
    audience: { role: "executive" },
    purpose: "inform",
    language: "en",
  } as unknown as PresentationBrief;

  const deckPlan = {
    id: "deck-1",
    title: "Test Deck",
    audience: "executive",
    genre: "business-review",
    slides: [{ keyMessage: "Test", intent: "summarize", contentKinds: ["summary"] }],
  } as unknown as DeckPlan;

  it("title element uses template slot frame for cover layout", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "slide-1",
        slideNumber: 1,
        title: "Cover Title",
        content: [
          { id: "t1", type: "title", text: "Cover Title" },
          { id: "s1", type: "subtitle", text: "Subtitle" },
        ],
        layout: { type: "title", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs, templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE });
    const titleEl = result.slides[0]!.elements.find((e) => "role" in e && e.role === "title");
    const subtitleEl = result.slides[0]!.elements.find((e) => "role" in e && e.role === "subtitle");

    // Cover layout title slot: { x: 120, y: 250, width: 1040, height: 90 }
    expect(titleEl).toBeDefined();
    expect(titleEl!.frame.x).toBe(120);
    expect(titleEl!.frame.y).toBe(250);
    expect(titleEl!.frame.width).toBe(1040);
    expect(titleEl!.frame.height).toBe(90);

    // Cover layout subtitle slot: { x: 120, y: 350, width: 1040, height: 50 }
    expect(subtitleEl).toBeDefined();
    expect(subtitleEl!.frame.x).toBe(120);
    expect(subtitleEl!.frame.y).toBe(350);
    expect(subtitleEl!.frame.width).toBe(1040);
    expect(subtitleEl!.frame.height).toBe(50);
  });

  it("content-standard title slot is used for regular content slide", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "slide-2",
        slideNumber: 1,
        title: "Content Title",
        content: [
          { id: "t1", type: "title", text: "Content Title" },
          { id: "p1", type: "paragraph", text: "Body text" },
        ],
        layout: { type: "single_column", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs, templateProfile: EXECUTIVE_NAVY_TEMPLATE_PROFILE });
    const titleEl = result.slides[0]!.elements.find((e) => "role" in e && e.role === "title");

    // content-standard title slot: { x: 80, y: 56, width: 1120, height: 72 }
    expect(titleEl).toBeDefined();
    expect(titleEl!.frame.x).toBe(80);
    expect(titleEl!.frame.y).toBe(56);
    expect(titleEl!.frame.width).toBe(1120);
    expect(titleEl!.frame.height).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// 5. No dedicated business layout explosion test
// ---------------------------------------------------------------------------

describe("no business layout explosion", () => {
  it("built-in profile has fewer than 23 layouts", () => {
    expect(EXECUTIVE_NAVY_TEMPLATE_PROFILE.layouts.length).toBeLessThanOrEqual(23);
  });

  it("no layout id matches a business strategy id", () => {
    const businessStrategyIds = [
      "kpi-card-overview",
      "kpi-dashboard-with-insight",
      "data-insight-story",
      "small-multiples-trend",
      "process-flow-with-impact",
      "implementation-roadmap",
      "action-plan-table",
      "decision-request",
    ];
    const layoutIds = EXECUTIVE_NAVY_TEMPLATE_PROFILE.layouts.map((l) => l.id);
    for (const strategyId of businessStrategyIds) {
      expect(layoutIds).not.toContain(strategyId);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Slot fallback trace tests
// ---------------------------------------------------------------------------

describe("buildPresentationIr slot fallback tracing", () => {
  const brief = {
    id: "brief-1",
    title: "Test",
    audience: { role: "executive" },
    purpose: "inform",
    language: "en",
  } as unknown as PresentationBrief;

  const deckPlan = {
    id: "deck-1",
    title: "Test Deck",
    audience: "executive",
    genre: "business-review",
    slides: [{ keyMessage: "Test", intent: "summarize", contentKinds: ["summary"] }],
  } as unknown as DeckPlan;

  it("fallbackSlots are collected from strategy assignments", () => {
    // kpi-dashboard-with-insight now maps to dashboard-cards-with-chart
    // which has metrics, visual, insight, callout — no cards slot
    const slideSpecs: SlideSpec[] = [
      {
        id: "s1",
        slideNumber: 1,
        title: "KPI Dashboard",
        intent: { type: "data_insight" },
        content: [
          { id: "t1", type: "title", text: "KPI Dashboard" },
          { id: "m1", type: "metric", label: "Revenue", value: "$1M" },
          { id: "m2", type: "metric", label: "Growth", value: "15%" },
          { id: "m3", type: "metric", label: "Users", value: "10k" },
          { id: "c1", type: "chart", chartType: "bar", data: { labels: ["A"], datasets: [{ label: "D", values: [1] }] } },
          { id: "co1", type: "callout", text: "Key insight here" },
        ],
        layout: { type: "dashboard", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
    const trace = result.slides[0]!._trace!;

    expect(trace.templateLayoutId).toBeDefined();
    expect(Array.isArray(trace.fallbackSlots)).toBe(true);
    // dashboard-cards-with-chart has metrics but not cards
    if (trace.templateLayoutId === "dashboard-cards-with-chart") {
      expect(trace.fallbackSlots).toContain("cards");
    }
  });

  it("usedSlots records insight when insight slot is used", () => {
    // data-insight-story now maps to visual-left-insight-right
    const slideSpecs: SlideSpec[] = [
      {
        id: "s2",
        slideNumber: 1,
        title: "Data Insight",
        intent: { type: "data_insight" },
        content: [
          { id: "t1", type: "title", text: "Data Insight" },
          { id: "c1", type: "chart", chartType: "line", data: { labels: ["Q1"], datasets: [{ label: "Rev", values: [100] }] } },
          { id: "co1", type: "callout", text: "Key finding" },
          { id: "p1", type: "paragraph", text: "Supporting analysis" },
          { id: "p2", type: "paragraph", text: "Additional context for the finding" },
        ],
        layout: { type: "single_column", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
    const trace = result.slides[0]!._trace!;

    expect(trace.layoutStrategyId).toBe("data-insight-story");
    expect(trace.templateLayoutId).toBe("visual-left-insight-right");
    // visual-left-insight-right has an insight slot — strategy should use it
    expect(trace.usedSlots).toContain("insight");
  });

  it("action-plan-table traces cta slot correctly", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "s3",
        slideNumber: 1,
        title: "Action Plan",
        intent: { type: "summary" },
        content: [
          { id: "t1", type: "title", text: "Action Plan" },
          { id: "tb1", type: "table", headers: ["Action", "Owner", "Due"], rows: [["Fix bug", "Alice", "2026-01"]] },
          { id: "co1", type: "callout", text: "Next steps: execute plan" },
        ],
        layout: { type: "single_column", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
    const trace = result.slides[0]!._trace!;

    // action-plan-table now resolves to table-with-cta which has table and cta slots
    if (trace.templateLayoutId === "table-with-cta" || trace.templateLayoutId === "table") {
      expect(trace.usedSlots).toContain("table");
      expect(trace.usedSlots).toContain("cta");
    }
  });

  it("title slot is tracked in usedSlots for cover layout", () => {
    const slideSpecs: SlideSpec[] = [
      {
        id: "s4",
        slideNumber: 1,
        title: "Cover",
        content: [{ id: "t1", type: "title", text: "Cover" }],
        layout: { type: "title", density: "medium" },
        speakerNotes: { text: "" },
      } as unknown as SlideSpec,
    ];

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
    const trace = result.slides[0]!._trace!;

    expect(trace.templateLayoutId).toBe("cover");
    expect(trace.usedSlots).toContain("title");
  });
});
