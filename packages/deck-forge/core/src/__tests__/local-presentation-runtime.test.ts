import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { JsonExporter } from "#src/exporters/json/json-exporter.js";
import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
import {
  LocalPresentationRuntime,
  createLocalRuntime,
} from "#src/runtime/local-presentation-runtime.js";

describe("LocalPresentationRuntime", () => {
  it("creates a new presentation with defaults", async () => {
    const runtime = new LocalPresentationRuntime({ exporters: [new JsonExporter()] });

    const created = await runtime.create({
      title: "Runtime Created Deck",
      theme: presentationFixture.theme,
    });

    expect(created.id).toMatch(/^deck-/);
    expect(created.meta.title).toBe("Runtime Created Deck");
    expect(created.slides).toHaveLength(0);
    expect(created.assets.assets).toHaveLength(0);
    expect(created.operationLog).toHaveLength(0);
  });

  it("applies operations and inspects via runtime facade", async () => {
    const runtime = new LocalPresentationRuntime({ exporters: [new JsonExporter()] });

    const updated = await runtime.applyOperations(presentationFixture, [
      {
        type: "add_text",
        slideId: "slide-text",
        role: "body",
        text: "Added through runtime",
      },
    ]);

    const inspected = await runtime.inspect(updated, {
      include: ["text"],
      slideId: "slide-text",
    });

    expect(inspected.text?.some((item) => item.text.includes("Added through runtime"))).toBe(true);
    expect(updated.operationLog).toHaveLength(1);
  });

  it("validates and exports through runtime facade", async () => {
    const runtime = new LocalPresentationRuntime({
      exporters: [new JsonExporter(), new PptxExporter()],
    });

    const report = await runtime.validate(presentationFixture, { level: "basic" });
    expect(report.summary.errorCount).toBe(0);

    const exported = await runtime.export(presentationFixture, { format: "json" });
    expect(exported.format).toBe("json");
    expect(typeof exported.data).toBe("string");
  });

  it("builds review packets with configured slide image renderer", async () => {
    const runtime = new LocalPresentationRuntime({
      exporters: [new JsonExporter()],
      slideImageRenderer: {
        render: async () => [
          {
            slideId: "slide-text",
            mimeType: "image/png",
            data: new Uint8Array([1, 2, 3]),
          },
        ],
      },
    });

    const packet = await runtime.buildReviewPacket(presentationFixture, {
      userRequest: "Review visual quality.",
      renderImages: true,
    });

    expect(packet.slideImages).toHaveLength(1);
    expect(packet.slideImages?.[0]?.slideId).toBe("slide-text");
  });

  it("throws when format has no exporter", async () => {
    const runtime = new LocalPresentationRuntime({ exporters: [new JsonExporter()] });

    await expect(runtime.export(presentationFixture, { format: "pptx" })).rejects.toThrow(
      "No exporter registered",
    );
  });

  it("blocks export outputPath outside workspace by default", async () => {
    const runtime = createLocalRuntime({
      safety: { workspaceRoot: process.cwd(), allowOutsideWorkspace: false },
    });

    await expect(
      runtime.export(presentationFixture, {
        format: "pptx",
        outputPath: "/tmp/deck-forge-outside.pptx",
      }),
    ).rejects.toThrow("PATH_OUTSIDE_WORKSPACE");
  });
});

describe("createLocalRuntime", () => {
  it("returns a LocalPresentationRuntime instance", () => {
    const runtime = createLocalRuntime();
    expect(runtime).toBeInstanceOf(LocalPresentationRuntime);
  });

  it("can export to json format", async () => {
    const runtime = createLocalRuntime();
    const exported = await runtime.export(presentationFixture, { format: "json" });
    expect(exported.format).toBe("json");
    expect(typeof exported.data).toBe("string");
  });

  it("can export to pptx format", async () => {
    const runtime = createLocalRuntime();
    const exported = await runtime.export(presentationFixture, { format: "pptx" });
    expect(exported.format).toBe("pptx");
  });

  it("materializes generated assets before pptx export", async () => {
    const runtime = createLocalRuntime();
    const generatedFixture = {
      ...presentationFixture,
      assets: {
        assets: presentationFixture.assets.assets.map((asset) =>
          asset.id === "asset-hero-001"
            ? {
                ...asset,
                uri: "generated://asset-hero-001.png",
                metadata: {
                  ...asset.metadata,
                  source: "generated" as const,
                  prompt: "Generated hero image",
                },
              }
            : asset,
        ),
      },
    };

    const exported = await runtime.export(generatedFixture, { format: "pptx" });
    expect(exported.format).toBe("pptx");
  });

  it("can export to html format", async () => {
    const runtime = createLocalRuntime();
    const exported = await runtime.export(presentationFixture, { format: "html" });
    expect(exported.format).toBe("html");
    expect(typeof exported.data).toBe("string");
  });

  it("can export to pdf format", async () => {
    const runtime = createLocalRuntime();
    const exported = await runtime.export(presentationFixture, { format: "pdf" });
    expect(exported.format).toBe("pdf");
    expect(exported.data).toBeInstanceOf(Uint8Array);
  });

  it("accepts exporter overrides", () => {
    const runtime = createLocalRuntime({ exporters: [new JsonExporter()] });
    expect(runtime).toBeInstanceOf(LocalPresentationRuntime);
  });
});
