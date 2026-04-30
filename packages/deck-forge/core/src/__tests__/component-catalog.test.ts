import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { preflightComponents, synthesizeComponents } from "#src/components/component-catalog.js";
import type { SlideSpec } from "#src/index.js";

const DEFAULT_TEMPLATES_DIR = path.join("templates", "components");

function makeSlide(overrides: Partial<SlideSpec> & { id: string }): SlideSpec {
  return {
    slideNumber: 1,
    title: overrides.id,
    intent: { type: "proposal", keyMessage: "k", audienceTakeaway: "a" },
    layout: { type: "single_column", density: "medium" },
    content: [],
    ...overrides,
  } as SlideSpec;
}

describe("component catalog", () => {
  it("synthesizes missing components and reuses on next preflight", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-forge-components-"));
    try {
      const slideSpecs = presentationFixture.slides.map((slide) => ({
        id: slide.id,
        title: slide.title ?? slide.id,
        intent:
          slide.intent ??
          ({
            type: "proposal",
            keyMessage: "message",
            audienceTakeaway: "takeaway",
          } as const),
        layout: slide.layout.spec,
        content: [
          {
            id: `${slide.id}-title`,
            type: "title" as const,
            text: slide.title ?? slide.id,
          },
        ],
      }));

      const first = await preflightComponents(slideSpecs, { componentsDir: dir });
      expect(first.missing.length).toBeGreaterThan(0);

      const synthesized = await synthesizeComponents(slideSpecs, { componentsDir: dir });
      expect(synthesized.created.length).toBeGreaterThan(0);

      const second = await preflightComponents(slideSpecs, { componentsDir: dir });
      expect(second.missing).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("detectCapability via preflight (default catalog)", () => {
  // The default catalog ships with the 0.3.x templates; preflight against it
  // should return a `match.componentId` indicating which template wins.
  async function matchFor(slide: SlideSpec): Promise<string | undefined> {
    const result = await preflightComponents([slide], { componentsDir: DEFAULT_TEMPLATES_DIR });
    return result.matches[0]?.componentId ?? result.missing[0]?.suggestedComponentId;
  }

  it("opening-style intent → title-slide", async () => {
    const slide = makeSlide({
      id: "s-title",
      intent: { type: "title", keyMessage: "k", audienceTakeaway: "a" },
    });
    expect(await matchFor(slide)).toBe("title-slide");
  });

  it("closing intent → closing-cta", async () => {
    const slide = makeSlide({
      id: "s-close",
      intent: { type: "closing", keyMessage: "k", audienceTakeaway: "a" },
    });
    expect(await matchFor(slide)).toBe("closing-cta");
  });

  it("agenda intent → agenda", async () => {
    const slide = makeSlide({
      id: "s-agenda",
      intent: { type: "agenda", keyMessage: "k", audienceTakeaway: "a" },
    });
    expect(await matchFor(slide)).toBe("agenda");
  });

  it("layout.type=matrix → matrix-2x2", async () => {
    const slide = makeSlide({
      id: "s-matrix",
      layout: { type: "matrix", density: "medium" },
    });
    expect(await matchFor(slide)).toBe("matrix-2x2");
  });

  it("layout.type=three_column → three-column", async () => {
    const slide = makeSlide({
      id: "s-tri",
      layout: { type: "three_column", density: "medium" },
    });
    expect(await matchFor(slide)).toBe("three-column");
  });

  it("layout.type=dashboard → dashboard", async () => {
    const slide = makeSlide({
      id: "s-dash",
      layout: { type: "dashboard", density: "medium" },
    });
    expect(await matchFor(slide)).toBe("dashboard");
  });

  it("quote block → quote-spotlight", async () => {
    const slide = makeSlide({
      id: "s-quote",
      content: [
        { id: "q1", type: "quote", text: "Less is more.", attribution: "Mies" },
      ] as SlideSpec["content"],
    });
    expect(await matchFor(slide)).toBe("quote-spotlight");
  });

  it("two metric blocks → metric-row", async () => {
    const slide = makeSlide({
      id: "s-metrics",
      content: [
        { id: "m1", type: "metric", label: "A", value: "1" },
        { id: "m2", type: "metric", label: "B", value: "2" },
      ] as SlideSpec["content"],
    });
    expect(await matchFor(slide)).toBe("metric-row");
  });

  it("chart + 2 metrics → dashboard", async () => {
    const slide = makeSlide({
      id: "s-cd",
      content: [
        {
          id: "c1",
          type: "chart",
          chartType: "bar",
          data: { series: [{ name: "x", values: [1] }] },
          encoding: {},
        },
        { id: "m1", type: "metric", label: "A", value: "1" },
        { id: "m2", type: "metric", label: "B", value: "2" },
      ] as SlideSpec["content"],
    });
    expect(await matchFor(slide)).toBe("dashboard");
  });

  it("chart only → chart-focus", async () => {
    const slide = makeSlide({
      id: "s-chart",
      content: [
        {
          id: "c1",
          type: "chart",
          chartType: "bar",
          data: { series: [{ name: "x", values: [1] }] },
          encoding: {},
        },
      ] as SlideSpec["content"],
    });
    expect(await matchFor(slide)).toBe("chart-focus");
  });
});
