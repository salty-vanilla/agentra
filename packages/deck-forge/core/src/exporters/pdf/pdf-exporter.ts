import { writeFile } from "node:fs/promises";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type {
  ExportOptions,
  ExportResult,
  Exporter,
  ImageElementIR,
  PresentationIR,
  SlideIR,
  SlideSize,
  TableElementIR,
  TextElementIR,
} from "#src/index.js";

const DATA_URI_IMAGE = /^data:image\/[a-zA-Z0-9+.-]+;base64,/;

export class PdfExporter implements Exporter {
  public readonly format = "pdf";

  public async export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult> {
    if (options.format !== "pdf") {
      throw new Error(`PdfExporter only supports format=pdf, received: ${options.format}`);
    }

    if (presentation.slides.length === 0) {
      throw new Error("PdfExporter requires at least one slide.");
    }

    const baseSlideSize = presentation.slides[0]?.layout.slideSize;
    if (!baseSlideSize) {
      throw new Error("PdfExporter requires slide.layout.slideSize on the first slide.");
    }

    const warnings: string[] = [];
    const slideSize = toPointsSlide(baseSlideSize);

    const pdf = await PDFDocument.create();
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

    for (const slide of presentation.slides) {
      const page = pdf.addPage([slideSize.width, slideSize.height]);
      await renderSlide(
        page,
        slide,
        presentation,
        baseSlideSize,
        warnings,
        regularFont,
        boldFont,
        pdf,
      );
    }

    const bytes = await pdf.save();

    if (options.outputPath) {
      await writeFile(options.outputPath, Buffer.from(bytes));
      return {
        format: "pdf",
        path: options.outputPath,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    return {
      format: "pdf",
      data: bytes,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

async function renderSlide(
  page: import("pdf-lib").PDFPage,
  slide: SlideIR,
  presentation: PresentationIR,
  slideSize: SlideSize,
  warnings: string[],
  regularFont: import("pdf-lib").PDFFont,
  boldFont: import("pdf-lib").PDFFont,
  pdf: PDFDocument,
): Promise<void> {
  const bgColor =
    presentation.theme.slideDefaults.backgroundColor ?? presentation.theme.colors.background;
  const bg = toRgb(bgColor);
  page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: bg });

  for (const element of slide.elements) {
    if (element.type === "text") {
      renderText(page, element, slideSize, regularFont, boldFont);
      continue;
    }

    if (element.type === "table") {
      renderTable(page, element, slideSize, regularFont, boldFont);
      continue;
    }

    if (element.type === "image") {
      await renderImage(page, element, presentation, slideSize, warnings, pdf);
      continue;
    }

    warnings.push(
      `Slide ${slide.id} element ${element.id} (${element.type}) is not supported by PdfExporter.`,
    );
  }
}

function renderText(
  page: import("pdf-lib").PDFPage,
  element: TextElementIR,
  slideSize: SlideSize,
  regularFont: import("pdf-lib").PDFFont,
  boldFont: import("pdf-lib").PDFFont,
): void {
  const frame = toPointFrame(element.frame, slideSize);
  const text = element.text.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
  const fontSize = element.style.fontSize ?? 16;
  const color = toRgb(element.style.color ?? "#0F172A");

  const lines = text.split("\n");
  const lineHeight = fontSize * 1.2;

  lines.forEach((line, index) => {
    const yTop = frame.y + index * lineHeight;
    if (yTop + lineHeight > frame.y + frame.h) {
      return;
    }

    const y = page.getHeight() - yTop - fontSize;
    page.drawText(line, {
      x: frame.x,
      y,
      size: fontSize,
      font: element.style.bold ? boldFont : regularFont,
      color,
      maxWidth: frame.w,
      lineHeight,
    });
  });
}

function renderTable(
  page: import("pdf-lib").PDFPage,
  element: TableElementIR,
  slideSize: SlideSize,
  regularFont: import("pdf-lib").PDFFont,
  boldFont: import("pdf-lib").PDFFont,
): void {
  const frame = toPointFrame(element.frame, slideSize);
  const columns = Math.max(1, element.headers.length);
  const rows = 1 + element.rows.length;
  const colWidth = frame.w / columns;
  const rowHeight = frame.h / rows;

  const border = toRgb(element.style?.borderColor ?? "#CBD5E1");
  const headerFill = toRgb(element.style?.headerFill ?? "#E2E8F0");
  const textColor = toRgb(element.style?.textStyle?.color ?? "#0F172A");
  const fontSize = element.style?.textStyle?.fontSize ?? 10;

  page.drawRectangle({
    x: frame.x,
    y: page.getHeight() - frame.y - rowHeight,
    width: frame.w,
    height: rowHeight,
    color: headerFill,
  });

  for (let row = 0; row <= rows; row += 1) {
    const y = page.getHeight() - (frame.y + row * rowHeight);
    page.drawLine({
      start: { x: frame.x, y },
      end: { x: frame.x + frame.w, y },
      thickness: 0.5,
      color: border,
    });
  }

  for (let col = 0; col <= columns; col += 1) {
    const x = frame.x + col * colWidth;
    page.drawLine({
      start: { x, y: page.getHeight() - frame.y },
      end: { x, y: page.getHeight() - frame.y - frame.h },
      thickness: 0.5,
      color: border,
    });
  }

  element.headers.forEach((header, colIndex) => {
    page.drawText(header, {
      x: frame.x + colIndex * colWidth + 4,
      y: page.getHeight() - frame.y - rowHeight + 4,
      size: fontSize,
      font: boldFont,
      color: textColor,
      maxWidth: colWidth - 8,
    });
  });

  element.rows.forEach((cells, rowIndex) => {
    cells.forEach((cell, colIndex) => {
      page.drawText(cell, {
        x: frame.x + colIndex * colWidth + 4,
        y: page.getHeight() - (frame.y + (rowIndex + 2) * rowHeight) + 4,
        size: fontSize,
        font: regularFont,
        color: textColor,
        maxWidth: colWidth - 8,
      });
    });
  });
}

async function renderImage(
  page: import("pdf-lib").PDFPage,
  element: ImageElementIR,
  presentation: PresentationIR,
  slideSize: SlideSize,
  warnings: string[],
  pdf: PDFDocument,
): Promise<void> {
  const asset = presentation.assets.assets.find((item) => item.id === element.assetId);

  if (!asset) {
    warnings.push(`Image asset not found: ${element.assetId}`);
    return;
  }

  if (!DATA_URI_IMAGE.test(asset.uri)) {
    warnings.push(`PdfExporter skips non-data-uri image asset: ${asset.id}`);
    return;
  }

  const frame = toPointFrame(element.frame, slideSize);
  const base64 = asset.uri.replace(DATA_URI_IMAGE, "");
  const bytes = Buffer.from(base64, "base64");

  try {
    const image = asset.uri.includes("image/png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);

    page.drawImage(image, {
      x: frame.x,
      y: page.getHeight() - frame.y - frame.h,
      width: frame.w,
      height: frame.h,
    });
  } catch {
    warnings.push(`Failed to render image for asset: ${asset.id}`);
  }
}

function toPointsSlide(slideSize: SlideSize): { width: number; height: number } {
  return {
    width: toPoints(slideSize.width, slideSize.unit),
    height: toPoints(slideSize.height, slideSize.unit),
  };
}

function toPointFrame(
  frame: { x: number; y: number; width: number; height: number },
  slideSize: SlideSize,
): { x: number; y: number; w: number; h: number } {
  return {
    x: toPoints(frame.x, slideSize.unit),
    y: toPoints(frame.y, slideSize.unit),
    w: toPoints(frame.width, slideSize.unit),
    h: toPoints(frame.height, slideSize.unit),
  };
}

function toPoints(value: number, unit: SlideSize["unit"]): number {
  if (unit === "pt") {
    return value;
  }
  if (unit === "in") {
    return value * 72;
  }
  return value * 0.75;
}

function toRgb(hex: string): import("pdf-lib").RGB {
  const normalized = hex.replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  return rgb(Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0);
}
