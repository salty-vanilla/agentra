import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PresentationIR } from "@deck-forge/core";
import { describe, expect, it } from "vitest";

import { runCli } from "../index.js";

describe("cli commands", () => {
  it("runs inspect and returns filtered slide output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const err: string[] = [];
      const code = await runCli(["inspect", inPath, "--slide", "slide-text"], {
        stdout: (text) => out.push(text),
        stderr: (text) => err.push(text),
      });

      expect(code).toBe(0);
      expect(err).toHaveLength(0);

      const payload = JSON.parse(out.join("\n"));
      expect(payload.slides).toHaveLength(1);
      expect(payload.slides[0].id).toBe("slide-text");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs validate and writes report file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");
    const outPath = join(dir, "validation.json");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const code = await runCli(["validate", inPath, "--out", outPath], {
        stdout: (text) => out.push(text),
        stderr: () => undefined,
      });

      expect(code).toBe(0);
      expect(out[0]).toContain("wrote validation report");

      const report = JSON.parse(await readFile(outPath, "utf8"));
      expect(report.status === "passed" || report.status === "warning").toBe(true);
      expect(report.summary.errorCount).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs export pptx and writes file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");
    const outPath = join(dir, "deck.pptx");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const code = await runCli(
        ["export", inPath, "--format", "pptx", "--out", outPath, "--workspace-root", dir],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(code).toBe(0);

      const summary = JSON.parse(out.join("\n"));
      expect(summary.format).toBe("pptx");
      expect(summary.path).toBe(outPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs plan and writes brief/deckPlan bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const outPath = join(dir, "plan.json");

    try {
      const out: string[] = [];
      const code = await runCli(
        ["plan", "Board meeting update", "--slide-count", "5", "--out", outPath],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(code).toBe(0);
      expect(out[0]).toContain("wrote plan output");

      const payload = JSON.parse(await readFile(outPath, "utf8"));
      expect(payload.brief).toBeDefined();
      expect(payload.deckPlan).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs build from plan output and writes slide/asset specs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const planPath = join(dir, "plan.json");
    const outPath = join(dir, "build.json");

    try {
      const planCode = await runCli(
        ["plan", "Retail strategy review", "--slide-count", "4", "--out", planPath],
        {
          stdout: () => undefined,
          stderr: () => undefined,
        },
      );
      expect(planCode).toBe(0);

      const out: string[] = [];
      const buildCode = await runCli(["build", planPath, "--out", outPath], {
        stdout: (text) => out.push(text),
        stderr: () => undefined,
      });

      expect(buildCode).toBe(0);
      expect(out[0]).toContain("wrote build output");

      const payload = JSON.parse(await readFile(outPath, "utf8"));
      expect(Array.isArray(payload.slideSpecs)).toBe(true);
      expect(Array.isArray(payload.assetSpecs)).toBe(true);
      expect(payload.slideSpecs.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs build from plan output and writes presentation artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const planPath = join(dir, "plan.json");
    const buildPath = join(dir, "build.json");
    const presentationPath = join(dir, "presentation.json");

    try {
      const planCode = await runCli(
        ["plan", "Quarterly product review", "--slide-count", "4", "--out", planPath],
        {
          stdout: () => undefined,
          stderr: () => undefined,
        },
      );
      expect(planCode).toBe(0);

      const out: string[] = [];
      const buildCode = await runCli(
        ["build", planPath, "--out", buildPath, "--presentation-out", presentationPath],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(buildCode).toBe(0);
      expect(out.some((line) => line.includes("wrote build output"))).toBe(true);
      expect(out.some((line) => line.includes("wrote presentation artifact"))).toBe(true);

      const presentation = JSON.parse(await readFile(presentationPath, "utf8"));
      expect(Array.isArray(presentation.slides)).toBe(true);
      expect(presentation.slides.length).toBeGreaterThan(0);
      expect(presentation.assets?.assets).toBeDefined();
      expect(presentation.brief).toBeDefined();
      expect(presentation.deckPlan).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs build from existing build output and plan context to write presentation artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const planPath = join(dir, "plan.json");
    const buildPath = join(dir, "build.json");
    const presentationPath = join(dir, "presentation-from-build.json");

    try {
      const planCode = await runCli(
        ["plan", "Retail strategy review", "--slide-count", "5", "--out", planPath],
        {
          stdout: () => undefined,
          stderr: () => undefined,
        },
      );
      expect(planCode).toBe(0);

      const buildCode = await runCli(["build", planPath, "--out", buildPath], {
        stdout: () => undefined,
        stderr: () => undefined,
      });
      expect(buildCode).toBe(0);

      const out: string[] = [];
      const artifactCode = await runCli(
        ["build", buildPath, "--plan", planPath, "--presentation-out", presentationPath],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(artifactCode).toBe(0);
      expect(out.some((line) => line.includes("wrote presentation artifact"))).toBe(true);

      const presentation = JSON.parse(await readFile(presentationPath, "utf8"));
      expect(presentation.meta?.title).toBeDefined();
      expect(Array.isArray(presentation.slides)).toBe(true);
      expect(presentation.slides.length).toBeGreaterThan(0);
      expect(presentation.brief).toBeDefined();
      expect(presentation.deckPlan).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs init and creates a skeleton presentation.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const outPath = join(dir, "presentation.json");

    try {
      const out: string[] = [];
      const code = await runCli(["init", outPath], {
        stdout: (text) => out.push(text),
        stderr: () => undefined,
      });

      expect(code).toBe(0);
      expect(out[0]).toContain("Created");

      const skeleton = JSON.parse(await readFile(outPath, "utf8"));
      expect(skeleton.id).toBeDefined();
      expect(skeleton.version).toBeDefined();
      expect(Array.isArray(skeleton.slides)).toBe(true);
      expect(skeleton.slides).toHaveLength(0);
      expect(skeleton.theme).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs export html and writes file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");
    const outPath = join(dir, "deck.html");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const code = await runCli(
        ["export", inPath, "--format", "html", "--out", outPath, "--workspace-root", dir],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(code).toBe(0);

      const written = await readFile(outPath, "utf8");
      expect(written).toContain("<!DOCTYPE html>");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs export pdf and writes file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");
    const outPath = join(dir, "deck.pdf");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const code = await runCli(
        ["export", inPath, "--format", "pdf", "--out", outPath, "--workspace-root", dir],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(code).toBe(0);

      const written = await readFile(outPath);
      expect(written.subarray(0, 4).toString("ascii")).toBe("%PDF");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("blocks export when --out is outside --workspace-root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const inPath = join(dir, "presentation.json");
    const workspaceRoot = join(dir, "workspace");
    const outPath = join(dir, "deck.pptx");

    try {
      await writeFile(inPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      await expect(
        runCli([
          "export",
          inPath,
          "--format",
          "pptx",
          "--out",
          outPath,
          "--workspace-root",
          workspaceRoot,
        ]),
      ).rejects.toThrow("PATH_OUTSIDE_WORKSPACE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs generate-image and updates presentation asset registry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const assetSpecPath = join(dir, "asset-spec.json");
    const presentationPath = join(dir, "presentation.json");
    const generatedAssetPath = join(dir, "generated-asset.json");

    try {
      await writeFile(
        assetSpecPath,
        JSON.stringify(
          {
            id: "asset-generated-001",
            type: "generated_image",
            purpose: "hero",
            visualDirection: { style: "minimal", mood: "calm" },
            prompt: "A clean generated hero image",
            aspectRatio: "16:9",
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(presentationPath, JSON.stringify(createPresentation(), null, 2), "utf8");

      const out: string[] = [];
      const code = await runCli(
        [
          "generate-image",
          assetSpecPath,
          "--output-dir",
          dir,
          "--workspace-root",
          dir,
          "--presentation",
          presentationPath,
          "--out",
          generatedAssetPath,
        ],
        {
          stdout: (text) => out.push(text),
          stderr: () => undefined,
        },
      );

      expect(code).toBe(0);
      expect(out.some((line) => line.includes("wrote updated presentation"))).toBe(true);
      expect(out.some((line) => line.includes("wrote generated asset"))).toBe(true);

      const generated = JSON.parse(await readFile(generatedAssetPath, "utf8"));
      expect(generated.asset.id).toBe("asset-generated-001");

      const updatedPresentation = JSON.parse(await readFile(presentationPath, "utf8"));
      expect(
        updatedPresentation.assets.assets.some(
          (asset: { id: string }) => asset.id === "asset-generated-001",
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails search-assets with provider when API key is missing", async () => {
    const err: string[] = [];
    const code = await runCli(["search-assets", "factory", "--provider", "unsplash"], {
      stdout: () => undefined,
      stderr: (text) => err.push(text),
    });

    expect(code).toBe(1);
    expect(err.join("\n")).toContain("unsplashApiKey or UNSPLASH_ACCESS_KEY");
  });

  it("fails fetch-asset with retrieved provider when API key is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deck-forge-cli-"));
    const specPath = join(dir, "retrieved-asset-spec.json");

    try {
      await writeFile(
        specPath,
        JSON.stringify(
          {
            id: "asset-retrieved-001",
            type: "retrieved_image",
            provider: "unsplash",
            query: "factory automation",
          },
          null,
          2,
        ),
        "utf8",
      );

      const err: string[] = [];
      const code = await runCli(["fetch-asset", specPath], {
        stdout: () => undefined,
        stderr: (text) => err.push(text),
      });

      expect(code).toBe(1);
      expect(err.join("\n")).toContain("unsplashApiKey or UNSPLASH_ACCESS_KEY");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createPresentation(): PresentationIR {
  return {
    id: "deck-001",
    version: "1.0.0",
    meta: {
      title: "CLI Test Deck",
      createdAt: "2026-04-28T00:00:00.000Z",
      updatedAt: "2026-04-28T00:00:00.000Z",
      author: "deck-forge",
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
    slides: [
      {
        id: "slide-text",
        index: 0,
        title: "Summary",
        intent: {
          type: "summary",
          keyMessage: "Quarter ended strong",
          audienceTakeaway: "Growth is healthy",
        },
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [
            {
              id: "body",
              role: "body",
              contentRefs: ["el-text"],
              priority: 1,
              frame: { x: 100, y: 140, width: 1080, height: 440 },
            },
          ],
        },
        elements: [
          {
            id: "el-text",
            type: "text",
            role: "body",
            text: { paragraphs: [{ runs: [{ text: "Revenue increased year over year." }] }] },
            frame: { x: 100, y: 140, width: 1080, height: 440 },
            style: { fontFamily: "Arial", fontSize: 24, color: "#0F172A" },
          },
          {
            id: "el-image",
            type: "image",
            assetId: "asset-hero-001",
            role: "hero",
            frame: { x: 100, y: 560, width: 160, height: 120 },
          },
          {
            id: "el-table",
            type: "table",
            frame: { x: 280, y: 560, width: 800, height: 120 },
            headers: ["KPI", "Value"],
            rows: [["Revenue", "$4.2M"]],
          },
        ],
      },
    ],
    assets: {
      assets: [
        {
          id: "asset-hero-001",
          type: "image",
          uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApWw4k4AAAAASUVORK5CYII=",
          mimeType: "image/png",
          metadata: { source: "external", createdAt: "2026-04-28T00:00:00.000Z" },
          usage: [{ slideId: "slide-text", elementId: "el-image", role: "hero" }],
        },
      ],
    },
    operationLog: [],
  };
}
