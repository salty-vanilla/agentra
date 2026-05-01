import { EventEmitter } from "node:events";
import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();

    setTimeout(async () => {
      if (command === "soffice") {
        const outDir = args[args.indexOf("--outdir") + 1];
        await writeFile(`${outDir}/deck.pdf`, "fake pdf");
      }
      if (command === "pdftoppm") {
        const prefix = args[args.length - 1];
        await writeFile(`${prefix}-1.png`, new Uint8Array([1, 2, 3]));
        await writeFile(`${prefix}-2.png`, new Uint8Array([4, 5, 6]));
      }
      child.emit("exit", 0);
    }, 0);

    return child;
  }),
}));

import type { PresentationIR, SlideIR, ThemeSpec } from "#src/index.js";
import { PptxSlideImageRenderer } from "#src/review/pptx-slide-image-renderer.js";

function makeTheme(): ThemeSpec {
  return {
    id: "theme-test",
    name: "Test",
    colors: {
      background: "#FFFFFF",
      surface: "#F8FAFC",
      textPrimary: "#0F172A",
      textSecondary: "#64748B",
      primary: "#2563EB",
      secondary: "#94A3B8",
      accent: "#F59E0B",
      chartPalette: ["#2563EB"],
    },
    typography: {
      fontFamily: { heading: "Inter", body: "Inter" },
      fontSize: { title: 36, heading: 24, body: 18, caption: 14, footnote: 12 },
      lineHeight: { tight: 1.1, normal: 1.4, relaxed: 1.6 },
      weight: { regular: 400, medium: 500, bold: 700 },
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
    radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
    slideDefaults: { backgroundColor: "#FFFFFF" },
    elementDefaults: {},
  };
}

function makeSlide(id: string, index: number): SlideIR {
  return {
    id,
    index,
    layout: {
      spec: { type: "single_column", density: "medium" },
      slideSize: { width: 1280, height: 720, unit: "px" },
      regions: [],
    },
    title: `Slide ${index + 1}`,
    elements: [
      {
        id: `title-${index + 1}`,
        type: "text",
        role: "title",
        text: { paragraphs: [{ runs: [{ text: `Slide ${index + 1}` }] }] },
        frame: { x: 80, y: 80, width: 1120, height: 100 },
        style: { fontSize: 36 },
      },
    ],
  };
}

function makePresentation(): PresentationIR {
  return {
    id: "pres-1",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    theme: makeTheme(),
    slides: [makeSlide("slide-1", 0), makeSlide("slide-2", 1)],
    assets: { assets: [] },
    operationLog: [],
  };
}

describe("PptxSlideImageRenderer", () => {
  it("renders one PNG per PPTX slide and marks images as pptx sourced", async () => {
    const renderer = new PptxSlideImageRenderer();

    const images = await renderer.render({ presentation: makePresentation() });

    expect(images).toHaveLength(2);
    expect(images[0]?.slideId).toBe("slide-1");
    expect(images[1]?.slideId).toBe("slide-2");
    expect(images.every((image) => image.source === "pptx")).toBe(true);
    expect(images.every((image) => image.renderer === "pptx-slide-image-renderer")).toBe(true);
    expect(images.every((image) => image.mimeType === "image/png")).toBe(true);
  });
});
