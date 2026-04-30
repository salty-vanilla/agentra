import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { JsonExporter } from "#src/exporters/json/json-exporter.js";
import {
  deserializePresentation,
  loadPresentationFromFile,
  savePresentationToFile,
  serializePresentation,
} from "#src/json.js";

describe("json exporter", () => {
  it("roundtrips a presentation through JSON string serialization", () => {
    const serialized = serializePresentation(presentationFixture);
    const parsed = deserializePresentation(serialized);

    expect(parsed).toEqual(presentationFixture);
  });

  it("exports JSON as in-memory data when outputPath is not provided", async () => {
    const exporter = new JsonExporter();
    const result = await exporter.export(presentationFixture, { format: "json" });

    expect(result.format).toBe("json");
    expect(typeof result.data).toBe("string");
    expect(result.path).toBeUndefined();
    expect(deserializePresentation(result.data as string)).toEqual(presentationFixture);
  });

  it("saves and loads a presentation from file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "deck-forge-json-"));
    const outputPath = join(directory, "presentation.json");

    try {
      const saveResult = await savePresentationToFile(presentationFixture, outputPath);
      expect(saveResult.path).toBe(outputPath);

      const raw = await readFile(outputPath, "utf8");
      expect(raw).toBe(serializePresentation(presentationFixture));

      const loaded = await loadPresentationFromFile(outputPath);
      expect(loaded).toEqual(presentationFixture);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws when JsonExporter receives a non-json format", async () => {
    const exporter = new JsonExporter();

    await expect(exporter.export(presentationFixture, { format: "pptx" })).rejects.toThrow(
      "JsonExporter only supports format=json",
    );
  });
});
