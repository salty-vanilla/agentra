import { describe, expect, it } from "vitest";

import type { PresentationIR, ShapeElementIR, SlideIR, TextElementIR } from "#src/index.js";
import { frameOverlapRatio } from "#src/geometry/frame-geometry.js";
import { applyOperations } from "#src/operations/apply-operations.js";
import { reflowElementsIntoLayoutRegions } from "#src/operations/utils.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";

const SLIDE_SIZE = { width: 1280, height: 720, unit: "px" as const };

function makeCallout(id: string, text: string): TextElementIR {
  return {
    id,
    type: "text",
    role: "callout",
    text: { paragraphs: [{ runs: [{ text }] }] },
    frame: { x: 200, y: 400, width: 400, height: 80 },
    style: { fontFamily: "Arial", fontSize: 16, color: "#0F172A" },
  };
}

function makeBackgroundShape(id: string): ShapeElementIR {
  return {
    id,
    type: "shape",
    shapeType: "rect",
    frame: { x: 0, y: 0, width: 1280, height: 720 },
    style: { fill: "#F1F5F9", opacity: 0.1 },
  };
}

function buildSlideWithCallouts(): { presentation: PresentationIR; slideId: string } {
  const presentation = structuredClone(presentationFixture);
  const slide: SlideIR = {
    id: "slide-callouts",
    index: presentation.slides.length,
    title: "Three callouts",
    layout: {
      spec: { type: "single_column", density: "medium" },
      slideSize: SLIDE_SIZE,
      regions: [
        {
          id: "body-region",
          role: "body",
          contentRefs: [],
          priority: 1,
          frame: { x: 80, y: 192, width: 1120, height: 408 },
        },
      ],
    },
    elements: [
      makeCallout("el-callout-1", "First"),
      makeCallout("el-callout-2", "Second"),
      makeCallout("el-callout-3", "Third"),
    ],
  };
  presentation.slides.push(slide);
  return { presentation, slideId: slide.id };
}

describe("reflowElementsIntoLayoutRegions via set_slide_layout", () => {
  it("distributes three identically-framed callouts into a body region", async () => {
    const { presentation, slideId } = buildSlideWithCallouts();

    const next = await applyOperations(presentation, [
      {
        type: "set_slide_layout",
        slideId,
        layout: {
          type: "single_column",
          density: "medium",
          regions: [
            {
              id: "body",
              role: "body",
              contentRefs: ["el-callout-1", "el-callout-2", "el-callout-3"],
              priority: 1,
            },
          ],
        },
      },
    ]);

    const slide = next.slides.find((candidate) => candidate.id === slideId);
    expect(slide).toBeDefined();
    if (!slide) return;

    const callouts = slide.elements.filter(
      (element) => element.type === "text" && element.role === "callout",
    );
    expect(callouts).toHaveLength(3);

    // No two callouts share the same frame anymore.
    const serialized = new Set(
      callouts.map((c) => `${c.frame.x},${c.frame.y},${c.frame.width},${c.frame.height}`),
    );
    expect(serialized.size).toBe(3);

    const bodyRegion = slide.layout.regions.find((region) => region.id === "body");
    expect(bodyRegion).toBeDefined();
    if (!bodyRegion) return;

    // All callouts sit inside the region (vertically inside, full width).
    for (const callout of callouts) {
      expect(callout.frame.x).toBe(bodyRegion.frame.x);
      expect(callout.frame.width).toBe(bodyRegion.frame.width);
      expect(callout.frame.y).toBeGreaterThanOrEqual(bodyRegion.frame.y);
      expect(callout.frame.y + callout.frame.height).toBeLessThanOrEqual(
        bodyRegion.frame.y + bodyRegion.frame.height + 1,
      );
    }

    // Region contentRefs reflect the assigned elements.
    expect(bodyRegion.contentRefs).toEqual(["el-callout-1", "el-callout-2", "el-callout-3"]);
  });

  it("places a table and a body text into separate regions in a two-column layout", async () => {
    const presentation = structuredClone(presentationFixture);
    const slide: SlideIR = {
      id: "slide-table-bullets",
      index: presentation.slides.length,
      title: "Table + bullets",
      layout: {
        spec: { type: "single_column", density: "medium" },
        slideSize: SLIDE_SIZE,
        regions: [],
      },
      elements: [
        {
          id: "el-bullets",
          type: "text",
          role: "body",
          text: { paragraphs: [{ runs: [{ text: "Point 1" }] }] },
          frame: { x: 100, y: 200, width: 600, height: 300 },
          style: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" },
        },
        {
          id: "el-tbl",
          type: "table",
          frame: { x: 100, y: 200, width: 600, height: 300 },
          headers: ["A", "B"],
          rows: [["1", "2"]],
        },
      ],
    };
    presentation.slides.push(slide);

    const next = await applyOperations(presentation, [
      {
        type: "set_slide_layout",
        slideId: slide.id,
        layout: {
          type: "two_column",
          density: "medium",
          regions: [
            { id: "body", role: "body", contentRefs: ["el-bullets"], priority: 1 },
            { id: "tbl", role: "visual", contentRefs: ["el-tbl"], priority: 2 },
          ],
        },
      },
    ]);

    const updated = next.slides.find((s) => s.id === slide.id);
    expect(updated).toBeDefined();
    if (!updated) return;

    const bullets = updated.elements.find((e) => e.id === "el-bullets");
    const tbl = updated.elements.find((e) => e.id === "el-tbl");
    expect(bullets).toBeDefined();
    expect(tbl).toBeDefined();
    if (!bullets || !tbl) return;

    expect(frameOverlapRatio(bullets.frame, tbl.frame)).toBeLessThan(0.05);
  });

  it("honors explicit contentRefs and does not raise unhonored-region-ref", async () => {
    const { presentation, slideId } = buildSlideWithCallouts();
    const next = await applyOperations(presentation, [
      {
        type: "set_slide_layout",
        slideId,
        layout: {
          type: "single_column",
          density: "medium",
          regions: [
            {
              id: "body",
              role: "body",
              contentRefs: ["el-callout-2"],
              priority: 1,
            },
          ],
        },
      },
    ]);

    const slide = next.slides.find((s) => s.id === slideId);
    expect(slide).toBeDefined();
    if (!slide) return;
    const callout2 = slide.elements.find((e) => e.id === "el-callout-2");
    expect(callout2).toBeDefined();
    const bodyRegion = slide.layout.regions[0];
    expect(bodyRegion).toBeDefined();
    if (!callout2 || !bodyRegion) return;
    expect(callout2.frame.x).toBe(bodyRegion.frame.x);
    expect(callout2.frame.width).toBe(bodyRegion.frame.width);

    const report = await validatePresentation(next);
    expect(
      report.issues.some((issue) => issue.message.includes("does not occupy the region")),
    ).toBe(false);
  });

  it("does not throw when contentRefs reference a non-existent element id", async () => {
    const { presentation, slideId } = buildSlideWithCallouts();
    await expect(
      applyOperations(presentation, [
        {
          type: "set_slide_layout",
          slideId,
          layout: {
            type: "single_column",
            density: "medium",
            regions: [
              {
                id: "body",
                role: "body",
                contentRefs: ["el-does-not-exist"],
                priority: 1,
              },
            ],
          },
        },
      ]),
    ).resolves.toBeDefined();
  });

  it("clamps a pre-existing out-of-bounds frame into slide bounds after reflow", async () => {
    const presentation = structuredClone(presentationFixture);
    const slide: SlideIR = {
      id: "slide-oob",
      index: presentation.slides.length,
      layout: {
        spec: { type: "single_column", density: "low" },
        slideSize: SLIDE_SIZE,
        regions: [],
      },
      elements: [
        {
          id: "el-oob",
          type: "text",
          role: "body",
          text: { paragraphs: [{ runs: [{ text: "Oops" }] }] },
          // far outside the 1280x720 slide
          frame: { x: 2000, y: 2000, width: 400, height: 200 },
          style: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" },
        },
      ],
    };
    presentation.slides.push(slide);

    const next = await applyOperations(presentation, [
      {
        type: "set_slide_layout",
        slideId: slide.id,
        layout: {
          type: "single_column",
          density: "low",
          regions: [
            { id: "body", role: "body", contentRefs: ["el-oob"], priority: 1 },
          ],
        },
      },
    ]);
    const oobEl = next.slides
      .find((s) => s.id === slide.id)
      ?.elements.find((e) => e.id === "el-oob");
    expect(oobEl).toBeDefined();
    if (!oobEl) return;
    expect(oobEl.frame.x + oobEl.frame.width).toBeLessThanOrEqual(SLIDE_SIZE.width);
    expect(oobEl.frame.y + oobEl.frame.height).toBeLessThanOrEqual(SLIDE_SIZE.height);
  });

  it("leaves decorative background shapes untouched but still clamps them", () => {
    const slide: SlideIR = {
      id: "slide-deco",
      index: 0,
      layout: {
        spec: { type: "single_column", density: "low" },
        slideSize: SLIDE_SIZE,
        regions: [
          {
            id: "body",
            role: "body",
            contentRefs: ["el-body"],
            priority: 1,
            frame: { x: 80, y: 192, width: 1120, height: 408 },
          },
        ],
      },
      elements: [
        makeBackgroundShape("el-bg"),
        {
          id: "el-body",
          type: "text",
          role: "body",
          text: { paragraphs: [{ runs: [{ text: "Body" }] }] },
          frame: { x: 100, y: 200, width: 600, height: 200 },
          style: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" },
        },
      ],
    };

    reflowElementsIntoLayoutRegions(slide);

    const bg = slide.elements.find((e) => e.id === "el-bg");
    const body = slide.elements.find((e) => e.id === "el-body");
    expect(bg).toBeDefined();
    expect(body).toBeDefined();
    if (!bg || !body) return;

    // Background frame preserved (full slide), not snapped to the region.
    expect(bg.frame.width).toBe(SLIDE_SIZE.width);
    expect(bg.frame.height).toBe(SLIDE_SIZE.height);

    // Body claimed the region.
    const bodyRegion = slide.layout.regions[0]!;
    expect(body.frame.x).toBe(bodyRegion.frame.x);
    expect(body.frame.width).toBe(bodyRegion.frame.width);
    expect(bodyRegion.contentRefs).toEqual(["el-body"]);
  });
});
