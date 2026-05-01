import { access } from "node:fs/promises";
import path from "node:path";

import PptxGenJS from "pptxgenjs";

import type {
  ChartElementIR,
  DiagramElementIR,
  ExportOptions,
  ExportResult,
  Exporter,
  ImageElementIR,
  PresentationIR,
  ResolvedFrame,
  ShapeElementIR,
  SlideSize,
  TableElementIR,
  TextElementIR,
  ThemeSpec,
} from "#src/index.js";

const DATA_URI_IMAGE = /^data:image\/[a-zA-Z0-9+.-]+;base64,/;

type MinimalPptxSlide = {
  background?: { color: string };
  addText: (
    text: string | Array<{ text: string; options?: Record<string, unknown> }>,
    options: Record<string, unknown>,
  ) => void;
  addImage: (options: Record<string, unknown>) => void;
  addTable: (rows: string[][], options: Record<string, unknown>) => void;
  addShape?: (shapeName: string, options: Record<string, unknown>) => void;
  addChart?: (
    type: string,
    data: Array<{ name: string; labels?: string[]; values: number[] }>,
    options: Record<string, unknown>,
  ) => void;
  addNotes?: (notes: string[]) => void;
};

export class PptxExporter implements Exporter {
  public readonly format = "pptx";

  public async export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult> {
    if (options.format !== "pptx") {
      throw new Error(`PptxExporter only supports format=pptx, received: ${options.format}`);
    }

    if (presentation.slides.length === 0) {
      throw new Error("PptxExporter requires at least one slide.");
    }

    const warnings: string[] = [];
    const PptxConstructor = PptxGenJS as unknown as new () => {
      defineLayout: (layout: { name: string; width: number; height: number }) => void;
      layout: string;
      title?: string;
      author?: string;
      addSlide: () => MinimalPptxSlide;
      writeFile: (options: { fileName: string }) => Promise<string>;
      write: (options: { outputType: "uint8array" }) => Promise<Uint8Array>;
    };
    const pptx = new PptxConstructor();

    const baseSlideSize = presentation.slides[0]?.layout.slideSize;
    if (!baseSlideSize) {
      throw new Error("PptxExporter requires slide.layout.slideSize on the first slide.");
    }

    const layout = toPptxLayout(baseSlideSize);
    pptx.defineLayout({ name: "DECK_FORGE_CUSTOM", width: layout.width, height: layout.height });
    pptx.layout = "DECK_FORGE_CUSTOM";

    if (presentation.meta.title) {
      pptx.title = presentation.meta.title;
    }
    if (presentation.meta.author) {
      pptx.author = presentation.meta.author;
    }

    for (const slideIR of presentation.slides) {
      if (!isSameSlideSize(baseSlideSize, slideIR.layout.slideSize)) {
        warnings.push(
          `Slide ${slideIR.id} has a different slide size. Using first slide size for export.`,
        );
      }

      const slide = pptx.addSlide();
      const backgroundColor = presentation.theme.slideDefaults.backgroundColor;

      if (backgroundColor) {
        slide.background = { color: normalizeHexColor(backgroundColor) };
      }

      for (const element of slideIR.elements) {
        if (element.type === "text") {
          renderTextElement(slide, element, baseSlideSize, presentation.theme);
          continue;
        }

        if (element.type === "image") {
          await renderImageElement(slide, element, baseSlideSize, presentation);
          continue;
        }

        if (element.type === "table") {
          warnings.push(...renderTableElement(slide, element, baseSlideSize, presentation.theme));
          continue;
        }

        if (element.type === "shape") {
          renderShapeElement(slide, element, baseSlideSize, presentation.theme);
          continue;
        }

        if (element.type === "chart") {
          warnings.push(
            ...renderChartElement(slide, element, baseSlideSize, presentation.theme),
          );
          continue;
        }

        if (element.type === "diagram") {
          warnings.push(
            ...renderDiagramElement(slide, element, baseSlideSize, presentation.theme),
          );
          continue;
        }

        const unhandled = element as { id: string; type: string };
        warnings.push(
          `Slide ${slideIR.id} element ${unhandled.id} (${unhandled.type}) is not supported by minimal PptxExporter.`,
        );
      }

      if (options.includeSpeakerNotes && slideIR.speakerNotes) {
        slide.addNotes?.([slideIR.speakerNotes]);
      }
    }

    if (options.outputPath) {
      await pptx.writeFile({ fileName: options.outputPath });
      return {
        format: "pptx",
        path: options.outputPath,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    const data = await pptx.write({ outputType: "uint8array" });

    return {
      format: "pptx",
      data,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

function renderTextElement(
  slide: MinimalPptxSlide,
  element: TextElementIR,
  slideSize: SlideSize,
  theme: ThemeSpec,
): void {
  const frame = toInchFrame(element.frame, slideSize);
  let textProps = richTextToPptxProps(element);
  const hasBullet = element.text.paragraphs.some((paragraph) => paragraph.bullet);

  const valign: "top" | "middle" | "bottom" =
    element.role === "title" || element.role === "callout"
      ? "middle"
      : element.role === "footer"
        ? "bottom"
        : "top";

  // ── Callout label + icon prefix ────────────────────────────────────
  // Detect known label prefixes in callout text and render them with
  // a unicode icon and accent color for strong visual hierarchy.
  if (element.role === "callout" && textProps.length > 0) {
    const firstText = textProps[0].text;
    const labelMatch = detectCalloutLabel(firstText);
    if (labelMatch) {
      const accentColor = normalizeHexColor(theme.colors.accent);
      const prefix = { text: `${labelMatch.icon} ${labelMatch.label}  `, options: { bold: true, color: accentColor } };
      const rest = { ...textProps[0], text: firstText.slice(labelMatch.matchLength) };
      textProps = [prefix, rest, ...textProps.slice(1)];
    }
  }

  const options: Record<string, unknown> = {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    align: element.text.paragraphs[0]?.alignment,
    bold: element.style.bold,
    italic: element.style.italic,
    underline: element.style.underline,
    fontFace: element.style.fontFamily,
    fontSize: element.style.fontSize,
    color: element.style.color ? normalizeHexColor(element.style.color) : undefined,
    valign,
    // Keep text inside the frame instead of letting PowerPoint grow the shape
    // and overlap adjacent regions.
    shrinkText: true,
  };

  if (hasBullet) {
    options.paraSpaceAfter = 6;
  }

  // Enforce minimum callout height so callouts don't become tiny footers
  if (element.role === "callout" && frame.h < 0.5) {
    options.h = 0.5;
  }

  // Decoration hint propagated from layout strategy or design pass.
  const decoration = element.decoration;
  const radiusMd = theme.radius?.md ?? 8;
  // Convert radius (px) to a 0..1 fraction of the shorter side as PptxGenJS
  // expects for `rectRadius`.
  const shorter = Math.min(frame.w, frame.h);
  const radiusFraction = shorter > 0 ? Math.min(0.5, radiusMd / 96 / shorter) : 0;

  if (decoration?.kind === "card") {
    options.fill = { color: normalizeHexColor(theme.colors.surface) };
    options.line = {
      color: normalizeHexColor(decoration.color ?? theme.colors.textSecondary),
      width: 0.25,
    };
    options.rectRadius = radiusFraction;
  } else if (decoration?.kind === "accent-bar") {
    // Accent bar: surface fill with strong left-side accent line
    options.fill = { color: normalizeHexColor(theme.colors.surface) };
    options.line = {
      color: normalizeHexColor(decoration.color ?? theme.colors.accent),
      width: 2,
    };
    options.rectRadius = radiusFraction;
  } else if (element.role === "callout") {
    options.fill = { color: normalizeHexColor(theme.colors.surface) };
    options.line = {
      color: normalizeHexColor(theme.colors.secondary ?? theme.colors.textSecondary),
      width: 0.5,
    };
    options.rectRadius = radiusFraction;
  }

  slide.addText(textProps, options);
}

function renderShapeElement(
  slide: MinimalPptxSlide,
  element: ShapeElementIR,
  slideSize: SlideSize,
  theme: ThemeSpec,
): void {
  const frame = toInchFrame(element.frame, slideSize);
  const fill = element.style.fill ?? theme.colors.surface;
  const stroke = element.style.stroke ?? theme.colors.textSecondary;
  const strokeWidth = element.style.strokeWidth ?? 1;

  const shapeName = mapShapeType(element.shapeType);
  const opts: Record<string, unknown> = {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    fill: { color: normalizeHexColor(fill) },
    line: { color: normalizeHexColor(stroke), width: strokeWidth },
  };
  if (element.shapeType === "round_rect") {
    const shorter = Math.min(frame.w, frame.h);
    const radius = element.style.radius ?? theme.radius?.md ?? 8;
    opts.rectRadius = shorter > 0 ? Math.min(0.5, radius / 96 / shorter) : 0;
  }
  slide.addShape?.(shapeName, opts);
}

function mapShapeType(
  shapeType: ShapeElementIR["shapeType"],
): "rect" | "roundRect" | "ellipse" | "line" | "rightArrow" {
  switch (shapeType) {
    case "round_rect":
      return "roundRect";
    case "ellipse":
      return "ellipse";
    case "line":
      return "line";
    case "arrow":
      return "rightArrow";
    default:
      return "rect";
  }
}

function richTextToPptxProps(
  element: TextElementIR,
): Array<{ text: string; options?: Record<string, unknown> }> {
  const props: Array<{ text: string; options?: Record<string, unknown> }> = [];

  element.text.paragraphs.forEach((paragraph, paragraphIndex) => {
    const isLastParagraph = paragraphIndex === element.text.paragraphs.length - 1;
    const runs = paragraph.runs.length > 0 ? paragraph.runs : [{ text: "" }];

    runs.forEach((run, runIndex) => {
      const isLastRun = runIndex === runs.length - 1;
      const runOptions: Record<string, unknown> = {};

      if (runIndex === 0 && paragraph.bullet) {
        const indentLevel = paragraph.bullet.indentLevel ?? 0;
        runOptions.bullet = indentLevel > 0 ? { indent: indentLevel } : true;
        if (indentLevel > 0) {
          runOptions.indentLevel = indentLevel;
        }
      }

      if (paragraph.alignment && runIndex === 0) {
        runOptions.align = paragraph.alignment;
      }

      if (isLastRun && !isLastParagraph) {
        runOptions.breakLine = true;
      }

      const entry: { text: string; options?: Record<string, unknown> } = {
        text: run.text,
      };
      if (Object.keys(runOptions).length > 0) {
        entry.options = runOptions;
      }
      props.push(entry);
    });
  });

  return props;
}

async function renderImageElement(
  slide: MinimalPptxSlide,
  element: ImageElementIR,
  slideSize: SlideSize,
  presentation: PresentationIR,
): Promise<void> {
  const asset = presentation.assets.assets.find((item) => item.id === element.assetId);

  if (!asset) {
    throw new Error(`Image asset not found: ${element.assetId}`);
  }

  const frame = toInchFrame(element.frame, slideSize);
  const imageSource = await resolveImageSource(asset.uri);

  slide.addImage({
    ...imageSource,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    // Preserve aspect ratio: scale the image to fit inside the frame.
    sizing: { type: "contain", w: frame.w, h: frame.h },
  });
}

function renderTableElement(
  slide: MinimalPptxSlide,
  element: TableElementIR,
  slideSize: SlideSize,
  theme: ThemeSpec,
): string[] {
  const frame = toInchFrame(element.frame, slideSize);
  const rows: string[][] = [element.headers, ...element.rows];
  const warnings: string[] = [];
  const rowCount = rows.length;
  const columnCount = Math.max(1, element.headers.length);
  const rowHeightPx = element.frame.height / Math.max(1, rowCount);
  const colWidthPx = element.frame.width / columnCount;
  const maxCellChars = rows.flat().reduce((max, cell) => Math.max(max, cell.length), 0);
  const baseFontSize = element.style?.textStyle?.fontSize ?? 12;
  const charFitFontSize = maxCellChars > 12 ? colWidthPx / 9 : colWidthPx / 7;
  const densityFontSize = Math.floor(Math.min(rowHeightPx * 0.42, charFitFontSize));
  const fontSize = Math.max(8, Math.min(baseFontSize, densityFontSize || baseFontSize));

  if (fontSize < baseFontSize) {
    warnings.push(
      `Table ${element.id} font size reduced from ${baseFontSize} to ${fontSize} for PPTX export density.`,
    );
  }
  if (rowHeightPx < 28) {
    warnings.push(
      `Table ${element.id} row height is tight for PPTX export (${rowHeightPx.toFixed(1)}px).`,
    );
  }
  if (maxCellChars > 24) {
    warnings.push(`Table ${element.id} contains long cell text that may wrap in PPTX export.`);
  }

  const headerFill = element.style?.headerFill
    ? normalizeHexColor(element.style.headerFill)
    : normalizeHexColor(theme.colors.primary);
  const headerTextColor = normalizeHexColor(theme.colors.background);
  const bodyFill = normalizeHexColor(theme.colors.background);
  const altRowFill = normalizeHexColor(theme.colors.surface);
  const borderColor = normalizeHexColor(element.style?.borderColor ?? theme.colors.textSecondary);
  const textColor = element.style?.textStyle?.color
    ? normalizeHexColor(element.style.textStyle.color)
    : normalizeHexColor(theme.colors.textPrimary);

  // Build row-level cell objects for header styling + alternating row fills.
  const formattedRows = rows.map((row, ri) => {
    const isHeader = ri === 0;
    return row.map((cell) => ({
      text: cell,
      options: {
        fill: { color: isHeader ? headerFill : ri % 2 === 0 ? altRowFill : bodyFill },
        color: isHeader ? headerTextColor : textColor,
        bold: isHeader,
        fontSize: isHeader ? Math.min(fontSize + 1, baseFontSize) : fontSize,
        valign: "middle" as const,
      },
    }));
  });

  slide.addTable(formattedRows as unknown as string[][], {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    border: { pt: 0.5, color: borderColor },
    margin: 0.05,
    fontFace: element.style?.textStyle?.fontFamily,
    fontSize,
    color: textColor,
  });

  return warnings;
}

function toPptxLayout(slideSize: SlideSize): { width: number; height: number } {
  return {
    width: toInches(slideSize.width, slideSize.unit),
    height: toInches(slideSize.height, slideSize.unit),
  };
}

type InchFrame = { x: number; y: number; w: number; h: number };

function toInchFrame(
  frame: ResolvedFrame,
  slideSize: SlideSize,
): InchFrame {
  return {
    x: toInches(frame.x, slideSize.unit),
    y: toInches(frame.y, slideSize.unit),
    w: toInches(frame.width, slideSize.unit),
    h: toInches(frame.height, slideSize.unit),
  };
}

function toInches(value: number, unit: SlideSize["unit"]): number {
  if (unit === "in") {
    return value;
  }

  if (unit === "pt") {
    return value / 72;
  }

  return value / 96;
}

function normalizeHexColor(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

function isSameSlideSize(left: SlideSize, right: SlideSize): boolean {
  return left.width === right.width && left.height === right.height && left.unit === right.unit;
}

async function resolveImageSource(uri: string): Promise<{ data: string } | { path: string }> {
  if (DATA_URI_IMAGE.test(uri)) {
    return { data: uri };
  }

  const resolvedPath = path.isAbsolute(uri) ? uri : path.resolve(process.cwd(), uri);
  await access(resolvedPath);

  return { path: resolvedPath };
}

// ---------------------------------------------------------------------------
// Placeholder rendering — used when chart/diagram data is empty or API
// is unavailable.
// ---------------------------------------------------------------------------

function renderPlaceholder(
  slide: MinimalPptxSlide,
  frame: InchFrame,
  message: string,
  theme: ThemeSpec,
): void {
  slide.addText([{ text: message }], {
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    align: "center",
    valign: "middle",
    fontSize: 14,
    color: normalizeHexColor(theme.colors.textSecondary),
    fill: { color: normalizeHexColor(theme.colors.surface) },
    line: {
      color: normalizeHexColor(theme.colors.textSecondary),
      width: 0.5,
      dashType: "dash",
    },
  });
}

// ---------------------------------------------------------------------------
// Chart rendering
// ---------------------------------------------------------------------------

function renderChartElement(
  slide: MinimalPptxSlide,
  element: ChartElementIR,
  slideSize: SlideSize,
  theme: ThemeSpec,
): string[] {
  const warnings: string[] = [];
  const frame = toInchFrame(element.frame, slideSize);

  const hasData =
    element.data.series.length > 0 &&
    element.data.series.some((s: { values: number[] }) => s.values.length > 0);

  if (!hasData) {
    renderPlaceholder(slide, frame, "Chart data unavailable", theme);
    warnings.push(`Chart element ${element.id}: rendered placeholder — data is empty or invalid.`);
    return warnings;
  }

  if (!slide.addChart) {
    renderPlaceholder(slide, frame, "Chart data unavailable", theme);
    warnings.push(
      `Chart element ${element.id}: rendered placeholder — addChart is not available.`,
    );
    return warnings;
  }

  // ── Chart title ──────────────────────────────────────────────────────
  let chartFrame = { ...frame };
  if (element.title) {
    const titleH = 0.3;
    slide.addText([{ text: element.title }], {
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: titleH,
      fontSize: 11,
      bold: true,
      color: normalizeHexColor(theme.colors.textPrimary),
      align: "left",
      valign: "bottom",
    });
    chartFrame = {
      x: frame.x,
      y: frame.y + titleH,
      w: frame.w,
      h: Math.max(0.5, frame.h - titleH),
    };
  }

  const palette = (element.style?.palette ?? theme.colors.chartPalette ?? []).map(
    normalizeHexColor,
  );

  // Smart legend: hide for single-series charts unless explicitly requested
  const legendPosition = element.style?.legendPosition;
  const showLegend =
    legendPosition === "none"
      ? false
      : element.style?.showLegend ??
        (element.data.series.length > 1);
  const legendPos = legendPosition === "none" ? "b" : (legendPosition ?? "b");

  const showGrid = element.style?.showGrid !== false;
  const showDataLabels = element.style?.showDataLabels ?? false;

  const chartType = mapChartType(element.chartType);
  const labels = element.data.categories ?? [];
  const data = element.data.series.map((s: { name: string; values: number[] }) => ({
    name: s.name,
    labels,
    values: s.values,
  }));

  // ── Horizontal bar heuristic ──────────────────────────────────────────
  const isBarType = chartType === "bar";
  const longLabels = labels.some((l) => l.length > 12);
  const manyCategories = labels.length > 5;
  const useHorizontalBar = isBarType && (longLabels || manyCategories);

  const opts: Record<string, unknown> = {
    x: chartFrame.x,
    y: chartFrame.y,
    w: chartFrame.w,
    h: chartFrame.h,
    showLegend,
    legendPos,
    showCatAxisTitle: false,
    showValAxisTitle: false,
    catAxisLabelColor: normalizeHexColor(theme.colors.textSecondary),
    valAxisLabelColor: normalizeHexColor(theme.colors.textSecondary),
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    valGridLine: showGrid
      ? { style: "solid", size: 0.5, color: normalizeHexColor(theme.colors.textSecondary) }
      : { style: "none" },
  };

  if (useHorizontalBar) {
    opts.barDir = "bar";
  }

  // Data labels for direct labelling
  if (showDataLabels) {
    opts.showValue = true;
    opts.dataLabelFontSize = 8;
    opts.dataLabelColor = normalizeHexColor(theme.colors.textSecondary);
    if (chartType === "pie") {
      opts.showPercent = true;
      opts.showValue = false;
    }
  }

  // Pie/donut: always show percentages for readability
  if (chartType === "pie") {
    opts.showPercent = true;
    opts.dataLabelFontSize = 9;
    opts.dataLabelColor = normalizeHexColor(theme.colors.textPrimary);
  }

  if (palette.length > 0) {
    opts.chartColors = palette;
  }
  slide.addChart(chartType, data, opts);

  // ── Target / reference lines (rendered as overlay shapes) ────────────
  const targetLines = element.style?.targetLines;
  if (targetLines && targetLines.length > 0 && chartType !== "pie") {
    const allValues = element.data.series.flatMap((s) => s.values);
    const dataMin = Math.min(0, ...allValues);
    const dataMax = Math.max(...allValues, ...targetLines.map((t) => t.value));
    const range = dataMax - dataMin || 1;

    for (const target of targetLines) {
      const ratio = (target.value - dataMin) / range;
      const yPos = chartFrame.y + chartFrame.h * (1 - ratio);
      const lineColor = normalizeHexColor(target.color ?? theme.colors.accent);
      slide.addShape?.("line", {
        x: chartFrame.x,
        y: yPos,
        w: chartFrame.w,
        h: 0,
        line: { color: lineColor, width: 1.5, dashType: "dash" },
      });
      if (target.label) {
        slide.addText([{ text: target.label }], {
          x: chartFrame.x + chartFrame.w - 1.2,
          y: yPos - 0.15,
          w: 1.2,
          h: 0.2,
          fontSize: 7,
          color: lineColor,
          align: "right",
          valign: "bottom",
        });
      }
    }
  }

  return warnings;
}

function mapChartType(chartType: ChartElementIR["chartType"]): string {
  switch (chartType) {
    case "line":
      return "line";
    case "area":
      return "area";
    case "pie":
      return "pie";
    case "scatter":
      return "scatter";
    case "combo":
      return "bar";
    default:
      return "bar";
  }
}

// ---------------------------------------------------------------------------
// Diagram rendering — laid out via the same algorithm as the HTML exporter.
// ---------------------------------------------------------------------------

function renderDiagramElement(
  slide: MinimalPptxSlide,
  element: DiagramElementIR,
  slideSize: SlideSize,
  theme: ThemeSpec,
): string[] {
  const warnings: string[] = [];
  const frame = toInchFrame(element.frame, slideSize);

  if (element.nodes.length === 0) {
    renderPlaceholder(slide, frame, "Diagram data unavailable", theme);
    warnings.push(
      `Diagram element ${element.id}: rendered placeholder — no nodes provided.`,
    );
    return warnings;
  }

  if (!slide.addShape) {
    renderPlaceholder(slide, frame, "Diagram data unavailable", theme);
    warnings.push(
      `Diagram element ${element.id}: rendered placeholder — addShape is not available.`,
    );
    return warnings;
  }

  // Compute layout in pixel space, then convert each node's box to inches
  // relative to the diagram's frame origin.
  const layout = layoutDiagramNodesPx(element);

  const pxToInchX = (px: number) => (px / element.frame.width) * frame.w;
  const pxToInchY = (px: number) => (px / element.frame.height) * frame.h;

  const fillColor = normalizeHexColor(element.style?.nodeFill ?? theme.colors.surface);
  const strokeColor = normalizeHexColor(theme.colors.primary);
  const edgeColor = normalizeHexColor(element.style?.edgeColor ?? theme.colors.textSecondary);
  const textColor = normalizeHexColor(element.style?.textStyle?.color ?? theme.colors.textPrimary);

  const nodeMap = new Map(layout.map((n) => [n.id, n]));

  // Edges first so nodes overlay them.
  const edges = element.edges ?? [];
  const implicitEdges =
    edges.length === 0 && isSequenceDiagramKind(element.diagramType)
      ? layout.slice(0, -1).map((from, i) => ({
          from: from.id,
          to: layout[i + 1].id,
        }))
      : [];

  for (const edge of [...edges, ...implicitEdges]) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const path = computeEdgePathPx(from, to);
    const x1 = frame.x + pxToInchX(path.x1);
    const y1 = frame.y + pxToInchY(path.y1);
    const x2 = frame.x + pxToInchX(path.x2);
    const y2 = frame.y + pxToInchY(path.y2);
    slide.addShape("line", {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(0.05, Math.abs(x2 - x1)),
      h: Math.max(0.05, Math.abs(y2 - y1)),
      flipH: x2 < x1,
      flipV: y2 < y1,
      line: { color: edgeColor, width: 1, endArrowType: "triangle" },
    });
  }

  for (const node of layout) {
    const x = frame.x + pxToInchX(node.cx - node.w / 2);
    const y = frame.y + pxToInchY(node.cy - node.h / 2);
    const w = pxToInchX(node.w);
    const h = pxToInchY(node.h);
    const radius = Math.min(0.5, theme.radius.md / 96 / Math.min(w, h));
    slide.addShape("roundRect", {
      x,
      y,
      w,
      h,
      fill: { color: fillColor },
      line: { color: strokeColor, width: 1 },
      rectRadius: radius,
    });
    slide.addText([{ text: node.label }], {
      x,
      y,
      w,
      h,
      align: "center",
      valign: "middle",
      fontSize: 11,
      bold: true,
      color: textColor,
      shrinkText: true,
    });
    // Step number badge — small accent circle at top-left of each node
    const nodeIndex = layout.indexOf(node);
    const badgeSize = 0.2;
    slide.addShape("ellipse", {
      x: x - badgeSize * 0.3,
      y: y - badgeSize * 0.3,
      w: badgeSize,
      h: badgeSize,
      fill: { color: strokeColor },
      line: { color: strokeColor, width: 0 },
    });
    slide.addText([{ text: `${nodeIndex + 1}` }], {
      x: x - badgeSize * 0.3,
      y: y - badgeSize * 0.3,
      w: badgeSize,
      h: badgeSize,
      align: "center",
      valign: "middle",
      fontSize: 7,
      bold: true,
      color: normalizeHexColor(theme.colors.background),
    });
  }
  return warnings;
}

type DiagramLaidOutNode = {
  id: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

function isSequenceDiagramKind(kind: DiagramElementIR["diagramType"]): boolean {
  return kind === "flowchart" || kind === "timeline" || kind === "funnel" || kind === "layered";
}

function layoutDiagramNodesPx(element: DiagramElementIR): DiagramLaidOutNode[] {
  const w = element.frame.width;
  const h = element.frame.height;
  const nodes = element.nodes;
  if (nodes.length === 0) return [];

  const padding = 16;
  const nodeH = Math.min(60, (h - padding * 2) * 0.4);

  if (element.diagramType === "cycle") {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - Math.max(60, nodeH);
    const nodeW = Math.min(140, (Math.PI * radius) / Math.max(1, nodes.length));
    return nodes.map((node, i) => {
      const angle = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
      return {
        id: node.id,
        label: node.label,
        cx: cx + radius * Math.cos(angle),
        cy: cy + radius * Math.sin(angle),
        w: nodeW,
        h: nodeH,
      };
    });
  }

  if (element.diagramType === "matrix") {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    const cellW = (w - padding * 2) / cols;
    const cellH = (h - padding * 2) / rows;
    const nodeW = Math.min(cellW * 0.85, 180);
    const nodeHGrid = Math.min(cellH * 0.7, nodeH);
    return nodes.map((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: node.id,
        label: node.label,
        cx: padding + col * cellW + cellW / 2,
        cy: padding + row * cellH + cellH / 2,
        w: nodeW,
        h: nodeHGrid,
      };
    });
  }

  const slot = (w - padding * 2) / nodes.length;
  const nodeW = Math.min(160, slot * 0.85);
  const cy = h / 2;
  return nodes.map((node, i) => ({
    id: node.id,
    label: node.label,
    cx: padding + slot * (i + 0.5),
    cy,
    w: nodeW,
    h: nodeH,
  }));
}

function computeEdgePathPx(from: DiagramLaidOutNode, to: DiagramLaidOutNode) {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const fromOffset = Math.min(from.w, from.h) / 2;
  const toOffset = Math.min(to.w, to.h) / 2 + 4;
  return {
    x1: from.cx + ux * fromOffset,
    y1: from.cy + uy * fromOffset,
    x2: to.cx - ux * toOffset,
    y2: to.cy - uy * toOffset,
  };
}

// ---------------------------------------------------------------------------
// Callout label detection — matches known prefixes like "Insight:",
// "Risk:", "Decision needed:", "Next action:" and returns the icon +
// label + length consumed so the renderer can split prefix from body.
// ---------------------------------------------------------------------------

type CalloutLabel = { icon: string; label: string; matchLength: number };

const CALLOUT_LABEL_PATTERNS: Array<{ pattern: RegExp; icon: string; label: string }> = [
  { pattern: /^insight\s*[:：]\s*/i, icon: "💡", label: "Insight" },
  { pattern: /^risk\s*[:：]\s*/i, icon: "⚠", label: "Risk" },
  { pattern: /^decision\s*(?:needed)?\s*[:：]\s*/i, icon: "❓", label: "Decision" },
  { pattern: /^next\s*action\s*[:：]\s*/i, icon: "▶", label: "Next Action" },
  { pattern: /^action\s*[:：]\s*/i, icon: "▶", label: "Action" },
  { pattern: /^note\s*[:：]\s*/i, icon: "📌", label: "Note" },
  { pattern: /^warning\s*[:：]\s*/i, icon: "⚠", label: "Warning" },
  { pattern: /^key\s*(?:finding|takeaway)\s*[:：]\s*/i, icon: "💡", label: "Key Finding" },
];

function detectCalloutLabel(text: string): CalloutLabel | undefined {
  for (const { pattern, icon, label } of CALLOUT_LABEL_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return { icon, label, matchLength: match[0].length };
    }
  }
  return undefined;
}
