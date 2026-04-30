import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { HtmlExporter } from "#src/exporters/html/html-exporter.js";
import type { PresentationIR } from "#src/index.js";
import type { SlideImage, SlideImageRenderInput, SlideImageRenderer } from "#src/review/types.js";

type PlaywrightModule = {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<Browser>;
  };
};

type Browser = {
  newContext: (options: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
  }) => Promise<BrowserContext>;
  close: () => Promise<void>;
};

type BrowserContext = {
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
};

type Page = {
  goto: (url: string) => Promise<unknown>;
  locator: (selector: string) => Locator;
};

type Locator = {
  nth: (index: number) => Locator;
  boundingBox: () => Promise<{ width: number; height: number } | null>;
  screenshot: (options: { type: "png" | "jpeg" }) => Promise<Buffer>;
};

export class HtmlSlideImageRenderer implements SlideImageRenderer {
  public async render(input: SlideImageRenderInput): Promise<SlideImage[]> {
    const format = input.format ?? "png";
    const scale = input.scale ?? 1;
    const slides = selectSlides(input.presentation, input.slideIds);
    if (slides.length === 0) {
      return [];
    }

    const playwright = await loadPlaywright();
    const tempDir = await mkdtemp(path.join(tmpdir(), "deck-forge-slides-"));
    const htmlPath = path.join(tempDir, "deck.html");
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      const exporter = new HtmlExporter();
      const result = await exporter.export(input.presentation, { format: "html" });
      await writeFile(htmlPath, String(result.data), "utf8");

      const baseSize = input.presentation.slides[0]?.layout.slideSize ?? {
        width: 1280,
        height: 720,
        unit: "px" as const,
      };
      browser = await playwright.chromium.launch({ headless: true });
      context = await browser.newContext({
        viewport: {
          width: Math.ceil(baseSize.width * scale),
          height: Math.ceil(baseSize.height * scale),
        },
        deviceScaleFactor: scale,
      });
      const page = await context.newPage();
      await page.goto(pathToFileURL(htmlPath).href);

      const images: SlideImage[] = [];
      for (const slide of slides) {
        const slideIndex = input.presentation.slides.findIndex(
          (candidate) => candidate.id === slide.id,
        );
        const locator = page.locator(".slide").nth(slideIndex);
        const box = await locator.boundingBox();
        const data = await locator.screenshot({ type: format });
        images.push({
          slideId: slide.id,
          mimeType: format === "png" ? "image/png" : "image/jpeg",
          data,
          width: box ? Math.round(box.width * scale) : undefined,
          height: box ? Math.round(box.height * scale) : undefined,
          source: "ir-html",
          renderer: "html-slide-image-renderer",
        });
      }

      return images;
    } finally {
      await context?.close();
      await browser?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function selectSlides(presentation: PresentationIR, slideIds?: string[]): PresentationIR["slides"] {
  if (!slideIds || slideIds.length === 0) {
    return presentation.slides;
  }

  const requested = new Set(slideIds);
  return presentation.slides.filter((slide) => requested.has(slide.id));
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<PlaywrightModule>;
    return await dynamicImport("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `SLIDE_IMAGE_RENDERER_UNAVAILABLE: HtmlSlideImageRenderer requires playwright to be installed and browser binaries to be available. Install playwright and run playwright install chromium. ${message}`,
    );
  }
}
