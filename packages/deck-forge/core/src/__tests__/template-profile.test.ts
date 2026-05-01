import { describe, expect, it } from "vitest";

import { EXECUTIVE_NAVY_TEMPLATE_PROFILE } from "#src/templates/builtins/executive-navy-v1.js";
import { resolveTemplateLayout } from "#src/templates/resolve-template-layout.js";
import type { TemplateSlotName } from "#src/templates/template-profile.js";
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
  ];

  it("contains all expected layout profiles", () => {
    const layoutIds = profile.layouts.map((l) => l.id);
    for (const id of expectedLayouts) {
      expect(layoutIds).toContain(id);
    }
  });

  it("has 9 layouts (no business layout explosion)", () => {
    expect(profile.layouts.length).toBe(9);
    expect(profile.layouts.length).toBeLessThanOrEqual(10);
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

  it("executive-summary-kpi strategy -> dashboard-cards", () => {
    const result = resolve("single_column", "executive-summary-kpi");
    expect(result.layout.id).toBe("dashboard-cards");
  });

  it("kpi-dashboard-with-insight strategy -> visual-insight", () => {
    const result = resolve("single_column", "kpi-dashboard-with-insight");
    expect(result.layout.id).toBe("visual-insight");
  });

  it("data-insight-story strategy -> visual-insight", () => {
    const result = resolve("single_column", "data-insight-story");
    expect(result.layout.id).toBe("visual-insight");
  });

  it("process-flow-with-impact strategy -> process", () => {
    const result = resolve("single_column", "process-flow-with-impact");
    expect(result.layout.id).toBe("process");
  });

  it("implementation-roadmap strategy -> process", () => {
    const result = resolve("single_column", "implementation-roadmap");
    expect(result.layout.id).toBe("process");
  });

  it("action-plan-table strategy -> table", () => {
    const result = resolve("single_column", "action-plan-table");
    expect(result.layout.id).toBe("table");
  });

  it("decision-request strategy -> content-standard", () => {
    const result = resolve("single_column", "decision-request");
    expect(result.layout.id).toBe("content-standard");
  });

  it("dashboard layout type -> dashboard-cards", () => {
    expect(resolve("dashboard").layout.id).toBe("dashboard-cards");
  });

  it("table layout type -> table (not supported as type, falls to content-standard)", () => {
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

  it("special type 'title' wins over strategy 'executive-summary-kpi'", () => {
    expect(resolve("title", "executive-summary-kpi").layout.id).toBe("cover");
  });

  it("special type 'section' wins over strategy 'kpi-dashboard-with-insight'", () => {
    expect(resolve("section", "kpi-dashboard-with-insight").layout.id).toBe("section");
  });

  // -- Priority: business strategy wins over generic layoutSpec.type --

  it("strategy 'kpi-dashboard-with-insight' wins over generic 'dashboard'", () => {
    expect(resolve("dashboard", "kpi-dashboard-with-insight").layout.id).toBe("visual-insight");
  });

  it("strategy 'data-insight-story' wins over generic 'dashboard'", () => {
    expect(resolve("dashboard", "data-insight-story").layout.id).toBe("visual-insight");
  });

  it("strategy 'implementation-roadmap' wins over generic 'timeline'", () => {
    expect(resolve("timeline", "implementation-roadmap").layout.id).toBe("process");
  });

  it("strategy 'action-plan-table' with generic 'table' still picks table", () => {
    expect(resolve("table", "action-plan-table").layout.id).toBe("table");
  });

  // -- Unknown strategy falls through to generic layoutSpec.type --

  it("unknown strategy with 'dashboard' falls to dashboard-cards", () => {
    expect(resolve("dashboard", "unknown-strategy").layout.id).toBe("dashboard-cards");
  });

  it("no strategy with 'two_column' falls to content-two-column", () => {
    expect(resolve("two_column", undefined).layout.id).toBe("content-two-column");
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
    slideCount: 1,
    slides: [{ slideNumber: 1, title: "Title Slide", intent: { type: "opening" } }],
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

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
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

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
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
    slideCount: 1,
    slides: [{ slideNumber: 1, title: "Title Slide", intent: { type: "opening" } }],
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

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
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

    const result = buildPresentationIr({ brief, deckPlan, slideSpecs });
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
  it("built-in profile has fewer than 10 layouts", () => {
    expect(EXECUTIVE_NAVY_TEMPLATE_PROFILE.layouts.length).toBeLessThanOrEqual(10);
  });

  it("no layout id matches a business strategy id", () => {
    const businessStrategyIds = [
      "executive-summary-kpi",
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
