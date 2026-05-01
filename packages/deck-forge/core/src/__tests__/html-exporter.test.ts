import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { HtmlExporter } from "#src/exporters/html/html-exporter.js";

describe("html exporter", () => {
  it("exports HTML as in-memory string when outputPath is not provided", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });

    expect(result.format).toBe("html");
    expect(typeof result.data).toBe("string");
    expect(result.path).toBeUndefined();

    const html = result.data as string;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("includes each slide in the output", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });
    const html = result.data as string;

    for (const slide of presentationFixture.slides) {
      expect(html).toContain(`id="slide-${slide.id}"`);
    }
  });

  it("includes presentation title in the <title> tag", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });
    const html = result.data as string;

    expect(html).toContain(`<title>${presentationFixture.meta.title}</title>`);
  });

  it("includes CSS variables for theme colors", async () => {
    const exporter = new HtmlExporter();
    const result = await exporter.export(presentationFixture, { format: "html" });
    const html = result.data as string;

    expect(html).toContain("--color-background:");
    expect(html).toContain("--color-text-primary:");
  });

  it("writes HTML to file when outputPath is provided", async () => {
    const directory = await mkdtemp(join(tmpdir(), "deck-forge-html-"));
    const outputPath = join(directory, "presentation.html");

    try {
      const exporter = new HtmlExporter();
      const result = await exporter.export(presentationFixture, {
        format: "html",
        outputPath,
      });

      expect(result.format).toBe("html");
      expect(result.path).toBe(outputPath);

      const written = await readFile(outputPath, "utf8");
      expect(written).toContain("<!DOCTYPE html>");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws when given a non-html format", async () => {
    const exporter = new HtmlExporter();
    await expect(exporter.export(presentationFixture, { format: "json" })).rejects.toThrow(
      "HtmlExporter only supports format=html",
    );
  });

  it("throws when presentation has no slides", async () => {
    const exporter = new HtmlExporter();
    const empty = { ...presentationFixture, slides: [] };
    await expect(exporter.export(empty, { format: "html" })).rejects.toThrow(
      "HtmlExporter requires at least one slide",
    );
  });
});
