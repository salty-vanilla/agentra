import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { GeneratedImageAssetSpec, PresentationIR } from "@deck-forge/core";
import { generateImageHandler } from "#src/handlers/generate-image-handler.js";

describe("generateImageHandler", () => {
  const assetSpec: GeneratedImageAssetSpec = {
    id: "asset-img-001",
    type: "generated_image",
    purpose: "hero",
    visualDirection: {
      style: "minimal",
      mood: "calm",
    },
    prompt: "A serene mountain landscape at sunrise",
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080 },
  };

  function input() {
    return {
      assetSpec,
      outputDir: tmpdir(),
    };
  }

  it("returns an asset with the same id as the assetSpec", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.id).toBe(assetSpec.id);
  });

  it("sets specId equal to the assetSpec id", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.specId).toBe(assetSpec.id);
  });

  it("returns asset type 'image'", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.type).toBe("image");
  });

  it("stores the prompt in asset metadata", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.metadata.prompt).toBe(assetSpec.prompt);
  });

  it("stores resolution dimensions when provided", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.metadata.width).toBe(1920);
    expect(result.asset.metadata.height).toBe(1080);
  });

  it("marks the asset source as 'generated'", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.metadata.source).toBe("generated");
  });

  it("returns a materialized URI", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.uri.endsWith(".png")).toBe(true);
  });

  it("returns empty usage array", async () => {
    const result = await generateImageHandler(input());
    expect(result.asset.usage).toEqual([]);
  });

  it("updates presentation asset registry when presentation is provided", async () => {
    const result = await generateImageHandler({
      ...input(),
      presentation: createPresentation(),
    });

    expect(result.presentation).toBeDefined();
    expect(result.presentation?.assets.assets.some((asset) => asset.id === assetSpec.id)).toBe(
      true,
    );
  });

  it("blocks outputDir outside workspace when safety policy is provided", async () => {
    await expect(
      generateImageHandler({
        ...input(),
        outputDir: "/tmp/deck-forge-outside-image",
        workspaceRoot: process.cwd(),
        allowOutsideWorkspace: false,
      }),
    ).rejects.toThrow("PATH_OUTSIDE_WORKSPACE");
  });
});

function createPresentation(): PresentationIR {
  return {
    id: "deck-001",
    version: "1.0.0",
    meta: {
      title: "Test Deck",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    theme: {
      id: "theme-default",
      name: "Default",
      colors: {
        background: "#FFFFFF",
        surface: "#F8FAFC",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        primary: "#1D4ED8",
        secondary: "#0EA5E9",
        accent: "#14B8A6",
        chartPalette: ["#1D4ED8", "#0EA5E9", "#14B8A6", "#F59E0B"],
      },
      typography: {
        fontFamily: { heading: "Arial", body: "Arial" },
        fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.7 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
      radius: { none: 0, sm: 4, md: 8, lg: 12, full: 999 },
      slideDefaults: { backgroundColor: "#FFFFFF", padding: 24 },
      elementDefaults: { text: { fontFamily: "Arial", fontSize: 18, color: "#0F172A" } },
    },
    slides: [],
    assets: { assets: [] },
    operationLog: [],
  };
}
