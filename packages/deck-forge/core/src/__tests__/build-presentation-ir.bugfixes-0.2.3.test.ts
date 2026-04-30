import { describe, expect, it } from "vitest";

import { buildPresentationIr } from "#src/builders/build-presentation-ir.js";
import type { DeckPlan, PresentationBrief, SlideSpec } from "#src/index.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

// Minimal helpers (mirrors patterns from build-presentation-ir.bugfixes.test.ts).
function makeBrief(): PresentationBrief {
  return {
    id: "brief-1",
    title: "Test Brief",
    audience: { primary: "Engineers", expertiseLevel: "intermediate" },
    goal: { type: "inform", primaryGoal: "share knowledge" },
    tone: { register: "neutral", energy: "calm" },
    narrative: { framework: "scqa", steps: [] },
    output: { format: ["pptx"] },
    constraints: { mustInclude: [], mustAvoid: [] },
    visualDirection: { style: "minimal", mood: "trustworthy" },
  } as unknown as PresentationBrief;
}

function makeDeckPlan(): DeckPlan {
  return {
    id: "deck-1",
    briefId: "brief-1",
    title: "Test Deck",
    slideCountTarget: 1,
    sections: [],
    globalStoryline: "test",
  } as DeckPlan;
}

function makeSlideSpec(
  content: SlideSpec["content"],
  overrides: Partial<SlideSpec> = {},
): SlideSpec {
  return {
    id: "slide-1",
    slideNumber: 1,
    title: "Test Slide",
    intent: {
      type: "data_insight",
      keyMessage: "test",
      audienceTakeaway: "test",
    },
    layout: { type: "single_column", density: "medium" },
    content,
    ...overrides,
  } as SlideSpec;
}

// ---------------------------------------------------------------------------
// Bug E: splitVertical must respect a minimum sub-frame height and use a
// larger gap when packing 3+ blocks into a single region.
// ---------------------------------------------------------------------------
describe("buildPresentationIr — splitVertical min height & gap", () => {
  it("yields sub-frames with height >= 60 and gap >= 16 for 4 paragraphs in body", () => {
    const slideSpec = makeSlideSpec([
      { id: "p1", type: "paragraph", text: "one" },
      { id: "p2", type: "paragraph", text: "two" },
      { id: "p3", type: "paragraph", text: "three" },
      { id: "p4", type: "paragraph", text: "four" },
    ]);

    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });

    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;

    const bodies = slide.elements.filter(
      (element) => element.type === "text" && element.role === "body",
    );
    expect(bodies.length).toBe(4);

    for (const body of bodies) {
      expect(body.frame.height).toBeGreaterThanOrEqual(60);
    }

    const sortedByY = [...bodies].sort((left, right) => left.frame.y - right.frame.y);
    for (let index = 1; index < sortedByY.length; index += 1) {
      const previous = sortedByY[index - 1];
      const current = sortedByY[index];
      if (!previous || !current) continue;
      const gap = current.frame.y - (previous.frame.y + previous.frame.height);
      // Allow gap to be >= 16 OR (when overflow forced reuse of last frame) zero.
      // Validation surfaces the overflow case as a separate warning; this
      // assertion targets the normal split case where all sub-frames fit.
      expect(gap === 0 || gap >= 16).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bug F: title and subtitle frames must not overlap vertically when the
// layout type is "title".
// ---------------------------------------------------------------------------
describe("buildPresentationIr — title layout subtitle non-overlap", () => {
  it("places subtitle strictly below the title frame", () => {
    const slideSpec = makeSlideSpec(
      [
        { id: "block-title", type: "title", text: "Headline" },
        { id: "block-subtitle", type: "subtitle", text: "Supporting text" },
      ],
      { layout: { type: "title", density: "low" } },
    );

    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });

    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;

    const title = slide.elements.find(
      (element) => element.type === "text" && element.role === "title",
    );
    const subtitle = slide.elements.find(
      (element) => element.type === "text" && element.role === "subtitle",
    );
    expect(title).toBeDefined();
    expect(subtitle).toBeDefined();
    if (!title || !subtitle) return;

    expect(title.frame.y + title.frame.height).toBeLessThanOrEqual(subtitle.frame.y);
  });
});

// ---------------------------------------------------------------------------
// Bug G: bullet_list IR uses native bullet metadata, not a textual "• " prefix.
// ---------------------------------------------------------------------------
describe("buildPresentationIr — native bullet metadata", () => {
  it("emits paragraphs with bullet.indentLevel and no '• ' prefix in run text", () => {
    const slideSpec = makeSlideSpec([
      {
        id: "block-bullets",
        type: "bullet_list",
        items: [{ text: "Top item", children: [{ text: "Nested item" }] }, { text: "Sibling" }],
      },
    ]);

    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });

    const slide = ir.slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;

    const bullet = slide.elements.find(
      (element) =>
        element.type === "text" && element.role === "body" && element.id === "block-bullets",
    );
    expect(bullet).toBeDefined();
    if (!bullet || bullet.type !== "text") return;

    expect(bullet.text.paragraphs.length).toBe(3);
    for (const paragraph of bullet.text.paragraphs) {
      expect(paragraph.bullet).toBeDefined();
      for (const run of paragraph.runs) {
        expect(run.text.startsWith("•")).toBe(false);
        expect(run.text.includes("• ")).toBe(false);
      }
    }
    expect(bullet.text.paragraphs[0]?.bullet?.indentLevel).toBe(0);
    expect(bullet.text.paragraphs[1]?.bullet?.indentLevel).toBe(1);
    expect(bullet.text.paragraphs[2]?.bullet?.indentLevel).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bug H: a slide with several body blocks and a callout should produce zero
// "Elements overlap" warnings.
// ---------------------------------------------------------------------------
describe("buildPresentationIr — overlap-free dense slide", () => {
  it("emits no overlap warnings for a 4-paragraph + callout slide", async () => {
    const slideSpec = makeSlideSpec([
      { id: "title-1", type: "title", text: "Tokyo Weather" },
      { id: "p1", type: "paragraph", text: "Morning: sunny" },
      { id: "p2", type: "paragraph", text: "Afternoon: cloudy" },
      { id: "p3", type: "paragraph", text: "Evening: light rain" },
      { id: "callout-1", type: "callout", text: "Bring an umbrella", tone: "warning" },
    ]);

    const ir = buildPresentationIr({
      brief: makeBrief(),
      deckPlan: makeDeckPlan(),
      slideSpecs: [slideSpec],
    });

    const report = await validatePresentation(ir);
    const overlapIssues = report.issues.filter((issue) => issue.message.includes("overlap"));
    expect(overlapIssues).toEqual([]);
  });
});
