import { describe, expect, it } from "vitest";

import { HtmlExporter } from "#src/exporters/html/html-exporter.js";
import type { PresentationIR, TextElementIR } from "#src/index.js";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("html exporter — Phase 4 decoration & typography", () => {
  it("emits spacing, radius, and shadow CSS variables derived from theme tokens", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });
    const html = result.data as string;

    expect(html).toContain("--space-xs:");
    expect(html).toContain("--space-md:");
    expect(html).toContain("--radius-md:");
    expect(html).toContain("--shadow-md:");
  });

  it("renders an accent stripe for slide titles", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });
    const html = result.data as string;

    expect(html).toContain(".text-title::after");
    expect(html).toContain("background: var(--color-accent)");
  });

  it("groups consecutive bullet paragraphs into a single <ul> and uses indent-N for nested levels", async () => {
    const presentation = clone(presentationFixture);
    const slide = presentation.slides[0];
    const bulletElement: TextElementIR = {
      id: "el-bullets",
      type: "text",
      role: "body",
      frame: { x: 80, y: 320, width: 1120, height: 240 },
      style: { fontFamily: "Arial", fontSize: 18 },
      text: {
        paragraphs: [
          { runs: [{ text: "Top one" }], bullet: { indentLevel: 0 } },
          { runs: [{ text: "Nested" }], bullet: { indentLevel: 1 } },
          { runs: [{ text: "Plain follow-up" }] },
        ],
      },
    };
    slide.elements.push(bulletElement);

    const exporter = new HtmlExporter();
    const result = await exporter.export(presentation, { format: "html" });
    const html = result.data as string;

    expect(html).toMatch(
      /<ul>[\s\S]*<li>Top one<\/li>[\s\S]*<li class="indent-1">Nested<\/li>[\s\S]*<\/ul>/,
    );
    expect(html).toContain("<p>Plain follow-up</p>");
  });

  it("applies deco-{kind} class when an element has a decoration", async () => {
    const presentation = clone(presentationFixture);
    const slide = presentation.slides[0];
    const cardElement: TextElementIR = {
      id: "el-card",
      type: "text",
      role: "body",
      frame: { x: 80, y: 320, width: 400, height: 200 },
      style: { fontFamily: "Arial", fontSize: 18 },
      text: { paragraphs: [{ runs: [{ text: "Card content" }] }] },
      decoration: { kind: "card" },
    };
    slide.elements.push(cardElement);

    const exporter = new HtmlExporter();
    const result = await exporter.export(presentation as PresentationIR, { format: "html" });
    const html = result.data as string;

    expect(html).toContain("deco-card");
    expect(html).toContain(".deco-card");
  });
});
