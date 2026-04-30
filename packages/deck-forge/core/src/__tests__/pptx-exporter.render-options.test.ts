import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock pptxgenjs so we can intercept addText / addImage calls instead of
// generating an actual .pptx archive.  Each test resets the mock state.
// ---------------------------------------------------------------------------

type MockSlide = {
  background?: { color: string };
  addText: ReturnType<typeof vi.fn>;
  addImage: ReturnType<typeof vi.fn>;
  addTable: ReturnType<typeof vi.fn>;
  addNotes: ReturnType<typeof vi.fn>;
};

const slides: MockSlide[] = [];

vi.mock("pptxgenjs", () => {
  class MockPptx {
    public layout = "";
    public title = "";
    public author = "";
    public defineLayout(): void {}
    public addSlide(): MockSlide {
      const slide: MockSlide = {
        addText: vi.fn(),
        addImage: vi.fn(),
        addTable: vi.fn(),
        addNotes: vi.fn(),
      };
      slides.push(slide);
      return slide;
    }
    public async writeFile({ fileName }: { fileName: string }): Promise<string> {
      return fileName;
    }
    public async write(): Promise<Uint8Array> {
      return new Uint8Array();
    }
  }
  return { default: MockPptx };
});

import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
import type { PresentationIR, SlideIR, ThemeSpec } from "#src/index.js";

const ONE_PIXEL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApWw4k4AAAAASUVORK5CYII=";

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

function makeSlide(overrides: Partial<SlideIR> = {}): SlideIR {
  return {
    id: "slide-1",
    index: 0,
    layout: {
      spec: { type: "single_column", density: "medium" },
      slideSize: { width: 1280, height: 720, unit: "px" },
      regions: [],
    },
    elements: [],
    ...overrides,
  } as SlideIR;
}

function makePresentation(slidesIn: SlideIR[]): PresentationIR {
  return {
    id: "pres-1",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    theme: makeTheme(),
    slides: slidesIn,
    assets: { assets: [] },
    operationLog: [],
  };
}

beforeEach(() => {
  slides.length = 0;
});

describe("pptx exporter — renderTextElement options", () => {
  it("passes shrinkText: true and role-appropriate valign to addText", async () => {
    const presentation = makePresentation([
      makeSlide({
        elements: [
          {
            id: "title-1",
            type: "text",
            role: "title",
            text: { paragraphs: [{ runs: [{ text: "Hello" }] }] },
            frame: { x: 80, y: 80, width: 1120, height: 120 },
            style: { fontSize: 36 },
          },
          {
            id: "body-1",
            type: "text",
            role: "body",
            text: { paragraphs: [{ runs: [{ text: "Body" }] }] },
            frame: { x: 80, y: 220, width: 1120, height: 200 },
            style: { fontSize: 18 },
          },
          {
            id: "footer-1",
            type: "text",
            role: "footer",
            text: { paragraphs: [{ runs: [{ text: "Footer" }] }] },
            frame: { x: 80, y: 660, width: 1120, height: 40 },
            style: { fontSize: 12 },
          },
        ],
      }),
    ]);

    const exporter = new PptxExporter();
    await exporter.export(presentation, { format: "pptx" });

    expect(slides).toHaveLength(1);
    const slide = slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;
    expect(slide.addText).toHaveBeenCalledTimes(3);

    const [, titleOpts] = slide.addText.mock.calls[0] ?? [];
    const [, bodyOpts] = slide.addText.mock.calls[1] ?? [];
    const [, footerOpts] = slide.addText.mock.calls[2] ?? [];

    expect(titleOpts?.shrinkText).toBe(true);
    expect(titleOpts?.valign).toBe("middle");
    expect(bodyOpts?.shrinkText).toBe(true);
    expect(bodyOpts?.valign).toBe("top");
    expect(footerOpts?.shrinkText).toBe(true);
    expect(footerOpts?.valign).toBe("bottom");
  });

  it("adds fill and line to callout-role text", async () => {
    const presentation = makePresentation([
      makeSlide({
        elements: [
          {
            id: "callout-1",
            type: "text",
            role: "callout",
            text: { paragraphs: [{ runs: [{ text: "Note" }] }] },
            frame: { x: 80, y: 500, width: 1120, height: 80 },
            style: { fontSize: 18 },
          },
        ],
      }),
    ]);

    const exporter = new PptxExporter();
    await exporter.export(presentation, { format: "pptx" });

    const slide = slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;
    const [, opts] = slide.addText.mock.calls[0] ?? [];
    expect(opts?.valign).toBe("middle");
    expect(opts?.fill).toMatchObject({ color: expect.any(String) });
    expect(opts?.line).toMatchObject({ color: expect.any(String), width: 0.5 });
  });

  it("emits native bullet metadata for paragraphs with bullet flag", async () => {
    const presentation = makePresentation([
      makeSlide({
        elements: [
          {
            id: "bullets-1",
            type: "text",
            role: "body",
            text: {
              paragraphs: [
                { runs: [{ text: "Top" }], bullet: { indentLevel: 0 } },
                { runs: [{ text: "Nested" }], bullet: { indentLevel: 1 } },
              ],
            },
            frame: { x: 80, y: 220, width: 1120, height: 200 },
            style: { fontSize: 18 },
          },
        ],
      }),
    ]);

    const exporter = new PptxExporter();
    await exporter.export(presentation, { format: "pptx" });

    const slide = slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;
    const [textProps, opts] = slide.addText.mock.calls[0] ?? [];

    expect(Array.isArray(textProps)).toBe(true);
    expect(opts?.paraSpaceAfter).toBe(6);

    const props = textProps as Array<{ text: string; options?: Record<string, unknown> }>;
    expect(props[0]?.options?.bullet).toBe(true);
    expect(props[1]?.options?.bullet).toMatchObject({ indent: 1 });
    expect(props[1]?.options?.indentLevel).toBe(1);
    // No "•" prefix should appear in the text payload.
    for (const entry of props) {
      expect(entry.text.startsWith("•")).toBe(false);
    }
  });
});

describe("pptx exporter — renderImageElement sizing", () => {
  it("passes sizing.type === 'contain' to addImage", async () => {
    const presentation: PresentationIR = {
      ...makePresentation([
        makeSlide({
          elements: [
            {
              id: "image-1",
              type: "image",
              assetId: "asset-img-1",
              role: "inline",
              frame: { x: 80, y: 80, width: 600, height: 400 },
            },
          ],
        }),
      ]),
      assets: {
        assets: [
          {
            id: "asset-img-1",
            type: "image",
            uri: ONE_PIXEL_PNG_DATA_URI,
            mimeType: "image/png",
            metadata: { source: "derived", createdAt: "1970-01-01T00:00:00.000Z" },
            usage: [],
          },
        ],
      },
    };

    const exporter = new PptxExporter();
    await exporter.export(presentation, { format: "pptx" });

    const slide = slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;
    const [opts] = slide.addImage.mock.calls[0] ?? [];
    expect(opts?.sizing).toMatchObject({ type: "contain" });
    expect(opts?.sizing?.w).toBe(opts?.w);
    expect(opts?.sizing?.h).toBe(opts?.h);
  });
});

describe("pptx exporter — table density options", () => {
  it("reduces dense table font size and returns export warnings", async () => {
    const presentation = makePresentation([
      makeSlide({
        elements: [
          {
            id: "table-1",
            type: "table",
            frame: { x: 80, y: 180, width: 600, height: 120 },
            headers: ["施策名", "目標値", "担当部門", "開始時期", "完了予定"],
            rows: [
              [
                "予防保全スケジュール強化",
                "ダウンタイム10時間以下",
                "製造・設備管理",
                "Q3 第1週",
                "Q3 第6週",
              ],
              ["不良品早期検出プロセス刷新", "不良率0.5%以下", "品質管理", "Q3 第1週", "Q3 第10週"],
            ],
            style: {
              textStyle: { fontFamily: "Inter", fontSize: 14, color: "#0F172A" },
            },
          },
        ],
      }),
    ]);

    const exporter = new PptxExporter();
    const result = await exporter.export(presentation, { format: "pptx" });

    const slide = slides[0];
    expect(slide).toBeDefined();
    if (!slide) return;

    const [, opts] = slide.addTable.mock.calls[0] ?? [];
    expect(opts?.fontSize).toBeLessThan(14);
    expect(opts?.margin).toBe(0.04);
    expect(opts?.valign).toBe("middle");
    expect(result.warnings?.some((warning) => warning.includes("font size reduced"))).toBe(true);
  });
});
