import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PptxExporter } from "#src/exporters/pptx/pptx-exporter.js";
import type { PresentationIR } from "#src/index.js";
import type { SlideImage, SlideImageRenderInput, SlideImageRenderer } from "#src/review/types.js";

export type PptxSlideImageRendererOptions = {
  sofficeCommand?: string;
  pdftoppmCommand?: string;
  dpi?: number;
};

export class PptxSlideImageRenderer implements SlideImageRenderer {
  private readonly sofficeCommand: string;
  private readonly pdftoppmCommand: string;
  private readonly dpi: number;

  public constructor(options: PptxSlideImageRendererOptions = {}) {
    this.sofficeCommand = options.sofficeCommand ?? "soffice";
    this.pdftoppmCommand = options.pdftoppmCommand ?? "pdftoppm";
    this.dpi = options.dpi ?? 110;
  }

  public async render(input: SlideImageRenderInput): Promise<SlideImage[]> {
    const format = input.format ?? "png";
    const slides = selectSlides(input.presentation, input.slideIds);
    if (slides.length === 0) {
      return [];
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), "deck-forge-pptx-slides-"));
    const pptxPath = path.join(tempDir, "deck.pptx");

    try {
      const exporter = new PptxExporter();
      await exporter.export(input.presentation, { format: "pptx", outputPath: pptxPath });

      await runProcess(this.sofficeCommand, [
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        tempDir,
        pptxPath,
      ]);

      const pdfPath = await findSinglePdf(tempDir);
      const outputPrefix = path.join(tempDir, "slide");
      await runProcess(this.pdftoppmCommand, [
        format === "png" ? "-png" : "-jpeg",
        "-r",
        String(Math.max(1, Math.round(this.dpi * (input.scale ?? 1)))),
        pdfPath,
        outputPrefix,
      ]);

      const renderedFiles = (await readdir(tempDir))
        .filter((name) => name.startsWith("slide-") && imageExtensionMatches(name, format))
        .sort((a, b) => extractSlideNumber(a) - extractSlideNumber(b));

      const requestedIds = input.slideIds ? new Set(input.slideIds) : undefined;
      const images: SlideImage[] = [];
      for (const [index, slide] of input.presentation.slides.entries()) {
        if (requestedIds && !requestedIds.has(slide.id)) {
          continue;
        }
        const renderedFile = renderedFiles[index];
        if (!renderedFile) {
          throw new Error(
            `PPTX_SLIDE_IMAGE_RENDER_FAILED: Missing rendered image for slide ${slide.id}.`,
          );
        }
        images.push({
          slideId: slide.id,
          mimeType: format === "png" ? "image/png" : "image/jpeg",
          data: await readFile(path.join(tempDir, renderedFile)),
          source: "pptx",
          renderer: "pptx-slide-image-renderer",
        });
      }

      return images;
    } finally {
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

async function findSinglePdf(workDir: string): Promise<string> {
  const pdfFiles = (await readdir(workDir)).filter((name) => name.endsWith(".pdf"));
  if (pdfFiles.length === 0) {
    throw new Error(`PPTX_SLIDE_IMAGE_RENDER_FAILED: soffice produced no PDF in ${workDir}.`);
  }
  return path.join(workDir, pdfFiles[0] ?? "");
}

function imageExtensionMatches(name: string, format: "png" | "jpeg"): boolean {
  return format === "png" ? name.endsWith(".png") : name.endsWith(".jpg");
}

function extractSlideNumber(name: string): number {
  const match = name.match(/slide-(\d+)\.(png|jpg)$/);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      reject(
        new Error(
          `PPTX_SLIDE_IMAGE_RENDERER_UNAVAILABLE: Failed to start ${command}. Ensure soffice and pdftoppm are installed. ${error.message}`,
        ),
      );
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      reject(
        new Error(
          `PPTX_SLIDE_IMAGE_RENDER_FAILED: ${command} exited with code ${code}: ${stderr.slice(
            0,
            1000,
          )}`,
        ),
      );
    });
  });
}
