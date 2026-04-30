import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";

const ONE_PIXEL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApWw4k4AAAAASUVORK5CYII=";

describe("pptx exporter", () => {
  it("exports pptx as in-memory binary data", async () => {
    const exporter = new PptxExporter();
    const deck = withInlineImage(presentationFixture);

    const result = await exporter.export(deck, { format: "pptx" });

    expect(result.format).toBe("pptx");
    expect(result.path).toBeUndefined();
    expect(result.data).toBeInstanceOf(Uint8Array);

    const zip = await JSZip.loadAsync(result.data as Uint8Array);
    const slideFiles = Object.keys(zip.files).filter(
      (file) => file.startsWith("ppt/slides/slide") && file.endsWith(".xml"),
    );

    expect(slideFiles).toHaveLength(4);

    const slide1 = await zip.file("ppt/slides/slide1.xml")?.async("string");
    const slide2 = await zip.file("ppt/slides/slide2.xml")?.async("string");
    const slide3 = await zip.file("ppt/slides/slide3.xml")?.async("string");
    const slide4 = await zip.file("ppt/slides/slide4.xml")?.async("string");

    expect(slide1).toContain("Q3 Business Review");
    expect(slide2).toContain("Revenue grew 18% YoY");
    expect(slide3).toContain("<a:blip");
    expect(slide4).toContain("<a:tbl");
  });

  it("writes pptx when outputPath is provided", async () => {
    const exporter = new PptxExporter();
    const deck = withInlineImage(presentationFixture);

    const directory = await mkdtemp(join(tmpdir(), "deck-forge-pptx-"));
    const outputPath = join(directory, "deck.pptx");

    try {
      const result = await exporter.export(deck, { format: "pptx", outputPath });
      expect(result.path).toBe(outputPath);
      await expect(access(outputPath)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws when exporter receives a non-pptx format", async () => {
    const exporter = new PptxExporter();

    await expect(exporter.export(presentationFixture, { format: "json" })).rejects.toThrow(
      "PptxExporter only supports format=pptx",
    );
  });
});

function withInlineImage(input: typeof presentationFixture): typeof presentationFixture {
  const cloned = structuredClone(input);
  const hero = cloned.assets.assets.find((asset) => asset.id === "asset-hero-001");

  if (!hero) {
    throw new Error("asset-hero-001 is required for pptx tests");
  }

  hero.uri = ONE_PIXEL_PNG_DATA_URI;

  return cloned;
}
