import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import {
  generateImageFromAssetSpec,
  materializeGeneratedAssets,
  retrieveImageFromAssetSpec,
  searchImageCandidates,
} from "#src/assets/image-runtime.js";
import type {
  GeneratedImageAssetSpec,
  ImageRetriever,
  PresentationIR,
  RetrievedImageAssetSpec,
} from "#src/index.js";

describe("image runtime", () => {
  it("generates an image asset from spec with materialized file path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-forge-img-"));
    const assetSpec: GeneratedImageAssetSpec = {
      id: "asset-generated-001",
      type: "generated_image",
      purpose: "hero",
      visualDirection: {
        style: "minimal",
        mood: "calm",
      },
      prompt: "A clean hero visual",
      aspectRatio: "16:9",
      resolution: { width: 1600, height: 900 },
    };

    const asset = await generateImageFromAssetSpec(assetSpec, { outputDir: dir });
    await access(asset.uri);

    expect(asset.id).toBe(assetSpec.id);
    expect(asset.metadata.source).toBe("generated");
    expect(asset.metadata.prompt).toBe(assetSpec.prompt);
    expect(asset.uri.endsWith(".png")).toBe(true);
  });

  it("materializes generated:// URIs in presentation asset registry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deck-forge-img-"));
    const input: PresentationIR = {
      ...presentationFixture,
      assets: {
        assets: [
          {
            id: "asset-generated-hero",
            specId: "asset-generated-hero",
            type: "image",
            uri: "generated://asset-generated-hero.png",
            mimeType: "image/png",
            metadata: {
              source: "generated",
              prompt: "Generated hero image",
              createdAt: "2026-04-28T00:00:00.000Z",
            },
            usage: [
              {
                slideId: "slide-image",
                elementId: "el-image",
                role: "hero",
              },
            ],
          },
        ],
      },
    };

    const materialized = await materializeGeneratedAssets(input, { outputDir: dir });
    const asset = materialized.assets.assets[0];

    expect(asset).toBeDefined();
    expect(asset?.uri.startsWith("generated://")).toBe(false);
    expect(asset?.uri.startsWith("placeholder://")).toBe(false);
    await access(asset?.uri ?? "");
  });

  it("blocks image generation outputDir outside workspace by default", async () => {
    const assetSpec: GeneratedImageAssetSpec = {
      id: "asset-generated-002",
      type: "generated_image",
      purpose: "hero",
      visualDirection: {
        style: "minimal",
        mood: "calm",
      },
      prompt: "A clean hero visual",
      aspectRatio: "16:9",
    };

    await expect(
      generateImageFromAssetSpec(assetSpec, {
        outputDir: "/tmp/deck-forge-outside-image",
        safety: { workspaceRoot: process.cwd(), allowOutsideWorkspace: false },
      }),
    ).rejects.toThrow("PATH_OUTSIDE_WORKSPACE");
  });

  it("uses openai provider when configured", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              b64_json:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApWw4k4AAAAASUVORK5CYII=",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch;

    const assetSpec: GeneratedImageAssetSpec = {
      id: "asset-generated-openai",
      type: "generated_image",
      purpose: "hero",
      visualDirection: {
        style: "minimal",
        mood: "calm",
      },
      prompt: "A clean hero visual",
      aspectRatio: "16:9",
    };

    try {
      const asset = await generateImageFromAssetSpec(assetSpec, {
        provider: "openai",
        openaiApiKey: "test-key",
        fallbackPolicy: "error",
      });

      expect(asset.metadata.generator).toBe("openai");
      expect(asset.uri.startsWith("data:image/png;base64,")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to local-file when provider generation fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;

    const assetSpec: GeneratedImageAssetSpec = {
      id: "asset-generated-fallback",
      type: "generated_image",
      purpose: "hero",
      visualDirection: {
        style: "minimal",
        mood: "calm",
      },
      prompt: "A clean hero visual",
      aspectRatio: "16:9",
    };

    try {
      const asset = await generateImageFromAssetSpec(assetSpec, {
        provider: "openai",
        openaiApiKey: "test-key",
        fallbackPolicy: "local-file",
      });

      expect(asset.metadata.generator).toBe("local-file");
      expect(asset.uri.endsWith(".png")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns provider-specific key error when search provider key is missing", async () => {
    await expect(
      searchImageCandidates("factory automation", { provider: "unsplash" }),
    ).rejects.toThrow("unsplashApiKey or UNSPLASH_ACCESS_KEY");
  });

  it("keeps retrieved metadata fields when converting retrieved_image spec to asset", async () => {
    const spec: RetrievedImageAssetSpec = {
      id: "asset-retrieved-001",
      type: "retrieved_image",
      provider: "unsplash",
      query: "industrial robotics",
      selected: {
        id: "candidate-1",
        provider: "unsplash",
        imageUrl: "https://example.com/robotics.jpg",
        sourcePageUrl: "https://example.com/source/robotics",
        author: "Jane Doe",
        license: "Unsplash License",
        attributionRequired: true,
        attributionText: "Photo by Jane Doe on Unsplash",
      },
    };

    const retriever: ImageRetriever = {
      name: "unsplash",
      search: async () => {
        throw new Error("search should not be called when selected exists");
      },
      download: async ({ candidate }) => ({
        id: "tmp-id",
        type: "image",
        uri: "data:image/jpeg;base64,AAAA",
        mimeType: "image/jpeg",
        metadata: {
          source: "external",
          createdAt: "2026-04-28T00:00:00.000Z",
        },
        usage: [],
      }),
    };

    const asset = await retrieveImageFromAssetSpec(spec, {
      retrievers: [retriever],
    });

    expect(asset.id).toBe(spec.id);
    expect(asset.specId).toBe(spec.id);
    expect(asset.metadata.provider).toBe("unsplash");
    expect(asset.metadata.author).toBe("Jane Doe");
    expect(asset.metadata.license).toBe("Unsplash License");
    expect(asset.metadata.sourcePageUrl).toBe("https://example.com/source/robotics");
    expect(asset.metadata.attributionRequired).toBe(true);
    expect(asset.metadata.attributionText).toBe("Photo by Jane Doe on Unsplash");
  });
});
