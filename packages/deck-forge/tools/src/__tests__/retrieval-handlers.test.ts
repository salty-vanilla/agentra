import { describe, expect, it } from "vitest";

import type { PresentationIR } from "@deck-forge/core";
import { attachRetrievedAssetHandler } from "#src/handlers/attach-retrieved-asset-handler.js";
import { searchAssetsHandler } from "#src/handlers/search-assets-handler.js";

describe("retrieval handlers", () => {
  it("returns explicit error when search provider key is missing", async () => {
    await expect(
      searchAssetsHandler({
        query: "factory automation",
        provider: "unsplash",
      }),
    ).rejects.toThrow("unsplashApiKey or UNSPLASH_ACCESS_KEY");
  });

  it("propagates retrieval error when provider key is missing", async () => {
    await expect(
      attachRetrievedAssetHandler({
        presentation: createPresentation(),
        assetSpec: {
          id: "asset-retrieved-001",
          type: "retrieved_image",
          provider: "unsplash",
          query: "factory automation",
        },
      }),
    ).rejects.toThrow("unsplashApiKey or UNSPLASH_ACCESS_KEY");
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
