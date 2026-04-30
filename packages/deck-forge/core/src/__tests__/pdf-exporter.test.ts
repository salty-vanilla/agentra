import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { PdfExporter } from "#src/exporters/pdf/pdf-exporter.js";

describe("pdf exporter", () => {
  it("exports pdf as in-memory binary data", async () => {
    const exporter = new PdfExporter();

    const result = await exporter.export(presentationFixture, { format: "pdf" });

    expect(result.format).toBe("pdf");
    expect(result.path).toBeUndefined();
    expect(result.data).toBeInstanceOf(Uint8Array);

    const buffer = Buffer.from(result.data as Uint8Array);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("writes pdf when outputPath is provided", async () => {
    const exporter = new PdfExporter();

    const directory = await mkdtemp(join(tmpdir(), "deck-forge-pdf-"));
    const outputPath = join(directory, "deck.pdf");

    try {
      const result = await exporter.export(presentationFixture, { format: "pdf", outputPath });
      expect(result.path).toBe(outputPath);
      await expect(access(outputPath)).resolves.toBeUndefined();

      const written = await readFile(outputPath);
      expect(written.subarray(0, 4).toString("ascii")).toBe("%PDF");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws when exporter receives a non-pdf format", async () => {
    const exporter = new PdfExporter();

    await expect(exporter.export(presentationFixture, { format: "json" })).rejects.toThrow(
      "PdfExporter only supports format=pdf",
    );
  });
});
