import { writeFile } from "node:fs/promises";

import type {
  ChartElementIR,
  DiagramElementIR,
  ExportOptions,
  ExportResult,
  Exporter,
  ImageElementIR,
  PresentationIR,
  ShapeElementIR,
  SlideIR,
  TableElementIR,
  TextElementIR,
  ThemeSpec,
} from "#src/index.js";

export class HtmlExporter implements Exporter {
  public readonly format = "html";

  public async export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult> {
    if (options.format !== "html") {
      throw new Error(`HtmlExporter only supports format=html, received: ${options.format}`);
    }

    if (presentation.slides.length === 0) {
      throw new Error("HtmlExporter requires at least one slide.");
    }

    const html = buildHtml(presentation);

    if (options.outputPath) {
      await writeFile(options.outputPath, html, "utf8");
      return { format: "html", path: options.outputPath };
    }

    return { format: "html", data: html };
  }
}

// ---------------------------------------------------------------------------
// HTML generation helpers
// ---------------------------------------------------------------------------

function buildHtml(presentation: PresentationIR): string {
  const { theme } = presentation;
  const slideWidth = presentation.slides[0]?.layout.slideSize.width ?? 1280;
  const slideHeight = presentation.slides[0]?.layout.slideSize.height ?? 720;

  const slidesHtml = presentation.slides
    .map((slide) => buildSlideHtml(slide, presentation, slideWidth, slideHeight))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(presentation.meta.title ?? "Presentation")}</title>
  <style>
${buildGlobalCss(theme, slideWidth, slideHeight)}
  </style>
</head>
<body>
  <div class="deck">
${slidesHtml}
  </div>
</body>
</html>`;
}

function buildGlobalCss(theme: ThemeSpec, slideWidth: number, slideHeight: number): string {
  const t = theme.colors;
  const ty = theme.typography;
  const sp = theme.spacing;
  const r = theme.radius;
  const sh = theme.shadows ?? {};

  return `    :root {
      --color-background: ${t.background};
      --color-surface: ${t.surface};
      --color-text-primary: ${t.textPrimary};
      --color-text-secondary: ${t.textSecondary};
      --color-primary: ${t.primary};
      --color-secondary: ${t.secondary};
      --color-accent: ${t.accent};
      --font-heading: ${ty.fontFamily.heading};
      --font-body: ${ty.fontFamily.body};
      --font-size-title: ${ty.fontSize.title}px;
      --font-size-heading: ${ty.fontSize.heading}px;
      --font-size-body: ${ty.fontSize.body}px;
      --font-size-caption: ${ty.fontSize.caption}px;
      --space-xs: ${sp.xs}px;
      --space-sm: ${sp.sm}px;
      --space-md: ${sp.md}px;
      --space-lg: ${sp.lg}px;
      --space-xl: ${sp.xl}px;
      --radius-sm: ${r.sm}px;
      --radius-md: ${r.md}px;
      --radius-lg: ${r.lg}px;
      --shadow-sm: ${sh.sm ?? "0 1px 2px rgba(15,23,42,0.08)"};
      --shadow-md: ${sh.md ?? "0 4px 12px rgba(15,23,42,0.12)"};
      --shadow-lg: ${sh.lg ?? "0 10px 24px rgba(15,23,42,0.18)"};
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1e1e1e;
      font-family: var(--font-body), sans-serif;
      color: var(--color-text-primary);
    }
    .deck {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      padding: 32px;
    }
    .slide {
      position: relative;
      width: ${slideWidth}px;
      height: ${slideHeight}px;
      background: var(--color-background);
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .slide-number {
      position: absolute;
      bottom: 8px;
      right: 16px;
      font-size: 12px;
      color: var(--color-text-secondary);
      opacity: 0.6;
    }
    .element {
      position: absolute;
      overflow: hidden;
    }
    .text-element { white-space: pre-wrap; }
    .text-element ul { list-style: none; padding: 0; margin: 0; }
    .text-element ul li { position: relative; padding-left: 1.1em; margin-bottom: var(--space-xs); }
    .text-element ul li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--color-accent);
      font-weight: bold;
    }
    .text-element ul li.indent-1 { padding-left: 2.2em; }
    .text-element ul li.indent-1::before { left: 1.1em; content: "◦"; }
    .text-element ul li.indent-2 { padding-left: 3.3em; }
    .text-element ul li.indent-2::before { left: 2.2em; content: "▪"; }
    .text-title {
      font-family: var(--font-heading), sans-serif;
      font-size: var(--font-size-title);
      font-weight: bold;
      position: relative;
    }
    .text-title::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: -6px;
      width: 56px;
      height: 4px;
      background: var(--color-accent);
      border-radius: var(--radius-sm);
    }
    .text-subtitle { font-family: var(--font-heading), sans-serif; font-size: var(--font-size-heading); color: var(--color-text-secondary); }
    .text-body { font-size: var(--font-size-body); line-height: 1.6; }
    .text-caption { font-size: var(--font-size-caption); color: var(--color-text-secondary); }
    .text-callout { font-size: var(--font-size-body); font-style: italic; border-left: 4px solid var(--color-accent); padding: var(--space-sm) var(--space-md); }
    .text-footer { font-size: var(--font-size-caption); color: var(--color-text-secondary); }
    .deco-card {
      background: var(--color-surface);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      padding: var(--space-md);
      border: none;
    }
    .deco-accent-bar {
      border-left: 4px solid var(--color-accent);
      padding-left: var(--space-md);
    }
    .deco-divider {
      border-top: 1px solid var(--color-text-secondary);
      padding-top: var(--space-sm);
      opacity: 0.95;
    }
    .image-element img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: var(--radius-sm); }
    .image-background img { object-fit: cover; }
    table.table-element { border-collapse: collapse; width: 100%; height: 100%; font-size: var(--font-size-body); }
    table.table-element th { background: var(--color-primary); color: #fff; padding: 6px 10px; text-align: left; font-weight: bold; }
    table.table-element td { padding: 5px 10px; border: 1px solid rgba(0,0,0,0.1); }
    table.table-element tr:nth-child(even) td { background: rgba(0,0,0,0.04); }`;
}

function buildSlideHtml(
  slide: SlideIR,
  presentation: PresentationIR,
  slideWidth: number,
  slideHeight: number,
): string {
  const elementsHtml = slide.elements
    .map((element) => {
      if (element.type === "text") {
        return buildTextElementHtml(element, slideWidth, slideHeight);
      }
      if (element.type === "image") {
        return buildImageElementHtml(element, presentation, slideWidth, slideHeight);
      }
      if (element.type === "table") {
        return buildTableElementHtml(element, slideWidth, slideHeight);
      }
      if (element.type === "chart") {
        return buildChartElementHtml(element, presentation.theme, slideWidth, slideHeight);
      }
      if (element.type === "diagram") {
        return buildDiagramElementHtml(element, presentation.theme, slideWidth, slideHeight);
      }
      if (element.type === "shape") {
        return buildShapeElementHtml(element, presentation.theme, slideWidth, slideHeight);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const bgColor = presentation.theme.slideDefaults.backgroundColor;
  const bgStyle = bgColor ? ` style="background:${bgColor}"` : "";

  return `    <div class="slide" id="slide-${escapeHtml(slide.id)}"${bgStyle}>
${elementsHtml}
      <span class="slide-number">${slide.index + 1}</span>
    </div>`;
}

function buildTextElementHtml(
  element: TextElementIR,
  slideWidth: number,
  slideHeight: number,
): string {
  const pos = frameToPercent(element.frame, slideWidth, slideHeight);
  const paragraphsHtml = renderParagraphsToHtml(element.text.paragraphs);

  const styleAttr = buildTextInlineStyle(element);
  const decorationClass = element.decoration ? ` deco-${element.decoration.kind}` : "";
  const decorationStyle = element.decoration?.color
    ? `border-left-color:${element.decoration.color};`
    : "";

  return `      <div class="element text-element text-${element.role}${decorationClass}" style="${pos}${styleAttr}${decorationStyle}">
        ${paragraphsHtml}
      </div>`;
}

/**
 * Render a sequence of `RichParagraph`s to HTML, grouping consecutive bullet
 * paragraphs into `<ul>` blocks (with `indent-N` classes for nested levels)
 * and rendering plain paragraphs as `<p>`.
 */
function renderParagraphsToHtml(paragraphs: TextElementIR["text"]["paragraphs"]): string {
  const out: string[] = [];
  let bulletGroup: TextElementIR["text"]["paragraphs"] = [];

  const flush = (): void => {
    if (bulletGroup.length === 0) return;
    const items = bulletGroup
      .map((p) => {
        const indent = p.bullet?.indentLevel ?? 0;
        const align = p.alignment ? ` style="text-align:${p.alignment}"` : "";
        const indentClass = indent > 0 ? ` class="indent-${Math.min(indent, 2)}"` : "";
        return `<li${indentClass}${align}>${renderRunsToHtml(p.runs)}</li>`;
      })
      .join("");
    out.push(`<ul>${items}</ul>`);
    bulletGroup = [];
  };

  for (const para of paragraphs) {
    if (para.bullet) {
      bulletGroup.push(para);
      continue;
    }
    flush();
    const align = para.alignment ? ` style="text-align:${para.alignment}"` : "";
    out.push(`<p${align}>${renderRunsToHtml(para.runs)}</p>`);
  }
  flush();
  return out.join("");
}

function renderRunsToHtml(runs: TextElementIR["text"]["paragraphs"][number]["runs"]): string {
  return runs
    .map((run) => {
      const text = escapeHtml(run.text);
      const s = run.style;
      if (!s) return text;
      const parts: string[] = [];
      if (s.color) parts.push(`color:${s.color}`);
      if (s.fontSize) parts.push(`font-size:${s.fontSize}px`);
      if (s.bold) parts.push("font-weight:bold");
      if (s.italic) parts.push("font-style:italic");
      if (s.underline) parts.push("text-decoration:underline");
      return parts.length > 0 ? `<span style="${parts.join(";")}">${text}</span>` : text;
    })
    .join("");
}

function buildImageElementHtml(
  element: ImageElementIR,
  presentation: PresentationIR,
  slideWidth: number,
  slideHeight: number,
): string {
  const asset = presentation.assets.assets.find((a) => a.id === element.assetId);
  if (!asset || asset.uri.startsWith("placeholder://")) {
    // Render a placeholder box
    const pos = frameToPercent(element.frame, slideWidth, slideHeight);
    return `      <div class="element image-element image-${element.role ?? "inline"}" style="${pos}background:#ccc;display:flex;align-items:center;justify-content:center;">
        <span style="color:#666;font-size:12px">image</span>
      </div>`;
  }

  const pos = frameToPercent(element.frame, slideWidth, slideHeight);
  const src = escapeHtml(asset.uri);
  const alt = escapeHtml(asset.metadata.prompt ?? "slide image");

  return `      <div class="element image-element image-${element.role ?? "inline"}" style="${pos}">
        <img src="${src}" alt="${alt}" loading="lazy" />
      </div>`;
}

function buildTableElementHtml(
  element: TableElementIR,
  slideWidth: number,
  slideHeight: number,
): string {
  const pos = frameToPercent(element.frame, slideWidth, slideHeight);

  const headerRow = element.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const bodyRows = element.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("\n");

  return `      <div class="element" style="${pos}overflow:auto;">
        <table class="table-element">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function frameToPercent(
  frame: { x: number; y: number; width: number; height: number },
  slideWidth: number,
  slideHeight: number,
): string {
  const x = ((frame.x / slideWidth) * 100).toFixed(4);
  const y = ((frame.y / slideHeight) * 100).toFixed(4);
  const w = ((frame.width / slideWidth) * 100).toFixed(4);
  const h = ((frame.height / slideHeight) * 100).toFixed(4);
  return `left:${x}%;top:${y}%;width:${w}%;height:${h}%;`;
}

function buildTextInlineStyle(element: TextElementIR): string {
  const parts: string[] = [];
  const s = element.style;
  if (s.color) parts.push(`color:${s.color}`);
  if (s.fontSize) parts.push(`font-size:${s.fontSize}px`);
  if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`);
  if (s.bold) parts.push("font-weight:bold");
  if (s.italic) parts.push("font-style:italic");
  if (s.underline) parts.push("text-decoration:underline");
  return parts.length > 0 ? `${parts.join(";")};` : "";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Shape rendering (SVG)
// ---------------------------------------------------------------------------

function buildShapeElementHtml(
  element: ShapeElementIR,
  theme: ThemeSpec,
  slideWidth: number,
  slideHeight: number,
): string {
  const pos = frameToPercent(element.frame, slideWidth, slideHeight);
  const fill = element.style.fill ?? theme.colors.surface;
  const stroke = element.style.stroke ?? theme.colors.textSecondary;
  const strokeWidth = element.style.strokeWidth ?? 1;
  const opacity = element.style.opacity ?? 1;
  const radius = element.style.radius ?? theme.radius.md;
  const w = element.frame.width;
  const h = element.frame.height;

  let shape = "";
  switch (element.shapeType) {
    case "ellipse":
      shape = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - strokeWidth}" ry="${h / 2 - strokeWidth}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      break;
    case "line":
      shape = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      break;
    case "arrow":
      shape = `<defs><marker id="arrow-${escapeHtml(element.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${stroke}" /></marker></defs><line x1="0" y1="${h / 2}" x2="${w - 10}" y2="${h / 2}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#arrow-${escapeHtml(element.id)})" opacity="${opacity}" />`;
      break;
    case "round_rect":
      shape = `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      break;
    default:
      shape = `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      break;
  }

  return `      <div class="element shape-element" style="${pos}">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${shape}</svg>
      </div>`;
}

// ---------------------------------------------------------------------------
// Chart rendering (SVG)
// ---------------------------------------------------------------------------

const CHART_PADDING = { top: 24, right: 24, bottom: 32, left: 40 };

function buildChartElementHtml(
  element: ChartElementIR,
  theme: ThemeSpec,
  slideWidth: number,
  slideHeight: number,
): string {
  const pos = frameToPercent(element.frame, slideWidth, slideHeight);
  const w = element.frame.width;
  const h = element.frame.height;
  const palette =
    element.style?.palette && element.style.palette.length > 0
      ? element.style.palette
      : (theme.colors.chartPalette ?? [
          theme.colors.primary,
          theme.colors.secondary ?? theme.colors.accent,
          theme.colors.accent,
        ]);
  const showLegend = element.style?.showLegend !== false;
  const showGrid = element.style?.showGrid !== false;

  let svgInner = "";
  switch (element.chartType) {
    case "line":
    case "area":
      svgInner = renderLineChart(
        element,
        w,
        h,
        palette,
        theme,
        showGrid,
        element.chartType === "area",
      );
      break;
    case "pie":
      svgInner = renderPieChart(element, w, h, palette, theme);
      break;
    case "scatter":
      svgInner = renderScatterChart(element, w, h, palette, theme, showGrid);
      break;
    default:
      // bar / combo / unknown → bar
      svgInner = renderBarChart(element, w, h, palette, theme, showGrid);
      break;
  }

  const legend = showLegend
    ? renderLegend(
        element.data.series.map((s, i) => ({ name: s.name, color: palette[i % palette.length] })),
        w,
        h,
        theme,
      )
    : "";

  return `      <div class="element chart-element" style="${pos}">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${svgInner}${legend}</svg>
      </div>`;
}

function chartBounds(w: number, h: number) {
  return {
    x: CHART_PADDING.left,
    y: CHART_PADDING.top,
    w: Math.max(10, w - CHART_PADDING.left - CHART_PADDING.right),
    h: Math.max(10, h - CHART_PADDING.top - CHART_PADDING.bottom),
  };
}

function chartValueRange(element: ChartElementIR): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const s of element.data.series) {
    for (const v of s.values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max === min) max = min + 1;
  return { min, max };
}

function renderBarChart(
  element: ChartElementIR,
  w: number,
  h: number,
  palette: string[],
  theme: ThemeSpec,
  showGrid: boolean,
): string {
  const b = chartBounds(w, h);
  const { min, max } = chartValueRange(element);
  const categories =
    element.data.categories ?? element.data.series[0]?.values.map((_, i) => `${i + 1}`) ?? [];
  const groupCount = categories.length;
  const seriesCount = element.data.series.length;
  if (groupCount === 0 || seriesCount === 0) return "";

  const groupWidth = b.w / groupCount;
  const barWidth = (groupWidth * 0.7) / seriesCount;
  const groupPad = groupWidth * 0.15;

  const grid = showGrid ? renderGridY(b, theme, 4, min, max) : "";
  const bars: string[] = [];
  const axisLabels: string[] = [];

  element.data.series.forEach((series, si) => {
    const color = palette[si % palette.length];
    series.values.forEach((value, ci) => {
      const xPos = b.x + ci * groupWidth + groupPad + si * barWidth;
      const valueRatio = (value - min) / (max - min);
      const barH = valueRatio * b.h;
      const yPos = b.y + b.h - barH;
      bars.push(
        `<rect x="${xPos.toFixed(2)}" y="${yPos.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barH.toFixed(2)}" fill="${color}" rx="2" />`,
      );
    });
  });

  categories.forEach((cat, ci) => {
    const cx = b.x + ci * groupWidth + groupWidth / 2;
    axisLabels.push(
      `<text x="${cx.toFixed(2)}" y="${(b.y + b.h + 16).toFixed(2)}" text-anchor="middle" font-size="10" fill="${theme.colors.textSecondary}">${escapeHtml(cat)}</text>`,
    );
  });

  return `${grid}${bars.join("")}${axisLabels.join("")}`;
}

function renderLineChart(
  element: ChartElementIR,
  w: number,
  h: number,
  palette: string[],
  theme: ThemeSpec,
  showGrid: boolean,
  fill: boolean,
): string {
  const b = chartBounds(w, h);
  const { min, max } = chartValueRange(element);
  const categories =
    element.data.categories ?? element.data.series[0]?.values.map((_, i) => `${i + 1}`) ?? [];
  const grid = showGrid ? renderGridY(b, theme, 4, min, max) : "";

  const lines: string[] = [];
  element.data.series.forEach((series, si) => {
    const color = palette[si % palette.length];
    const points = series.values.map((value, i) => {
      const x =
        b.x + (series.values.length === 1 ? b.w / 2 : (i / (series.values.length - 1)) * b.w);
      const y = b.y + b.h - ((value - min) / (max - min)) * b.h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    if (fill && points.length > 0) {
      const closed = `${b.x},${b.y + b.h} ${points.join(" ")} ${b.x + b.w},${b.y + b.h}`;
      lines.push(
        `<polygon points="${closed}" fill="${color}" fill-opacity="0.25" stroke="none" />`,
      );
    }
    lines.push(
      `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`,
    );
    series.values.forEach((_, i) => {
      const [x, y] = points[i].split(",");
      lines.push(`<circle cx="${x}" cy="${y}" r="3" fill="${color}" />`);
    });
  });

  const axisLabels = categories.map((cat, ci) => {
    const x = b.x + (categories.length === 1 ? b.w / 2 : (ci / (categories.length - 1)) * b.w);
    return `<text x="${x.toFixed(2)}" y="${(b.y + b.h + 16).toFixed(2)}" text-anchor="middle" font-size="10" fill="${theme.colors.textSecondary}">${escapeHtml(cat)}</text>`;
  });

  return `${grid}${lines.join("")}${axisLabels.join("")}`;
}

function renderPieChart(
  element: ChartElementIR,
  w: number,
  h: number,
  palette: string[],
  theme: ThemeSpec,
): string {
  // Pie: aggregate first series.
  const series = element.data.series[0];
  if (!series || series.values.length === 0) return "";
  const total = series.values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return "";

  const cx = w / 2;
  const cy = h / 2 - 8;
  const radius = Math.min(w, h - 16) / 2 - 8;

  let angleStart = -Math.PI / 2;
  const slices = series.values.map((value, i) => {
    const sweep = (Math.max(0, value) / total) * 2 * Math.PI;
    const angleEnd = angleStart + sweep;
    const x1 = cx + radius * Math.cos(angleStart);
    const y1 = cy + radius * Math.sin(angleStart);
    const x2 = cx + radius * Math.cos(angleEnd);
    const y2 = cy + radius * Math.sin(angleEnd);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const path =
      sweep >= Math.PI * 2 - 0.0001
        ? `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`
        : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    angleStart = angleEnd;
    const color = palette[i % palette.length];
    return `<path d="${path}" fill="${color}" stroke="${theme.colors.background}" stroke-width="1" />`;
  });

  return slices.join("");
}

function renderScatterChart(
  element: ChartElementIR,
  w: number,
  h: number,
  palette: string[],
  theme: ThemeSpec,
  showGrid: boolean,
): string {
  const b = chartBounds(w, h);
  const { min, max } = chartValueRange(element);
  const grid = showGrid ? renderGridY(b, theme, 4, min, max) : "";
  const dots: string[] = [];
  element.data.series.forEach((series, si) => {
    const color = palette[si % palette.length];
    series.values.forEach((value, i) => {
      const x =
        b.x + (series.values.length === 1 ? b.w / 2 : (i / (series.values.length - 1)) * b.w);
      const y = b.y + b.h - ((value - min) / (max - min)) * b.h;
      dots.push(
        `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${color}" opacity="0.85" />`,
      );
    });
  });
  return `${grid}${dots.join("")}`;
}

function renderGridY(
  b: { x: number; y: number; w: number; h: number },
  theme: ThemeSpec,
  steps: number,
  min: number,
  max: number,
): string {
  const lines: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const y = b.y + b.h - ratio * b.h;
    const value = min + ratio * (max - min);
    lines.push(
      `<line x1="${b.x}" y1="${y.toFixed(2)}" x2="${b.x + b.w}" y2="${y.toFixed(2)}" stroke="${theme.colors.textSecondary}" stroke-opacity="0.15" stroke-width="1" />`,
    );
    lines.push(
      `<text x="${(b.x - 4).toFixed(2)}" y="${(y + 3).toFixed(2)}" text-anchor="end" font-size="9" fill="${theme.colors.textSecondary}">${formatChartTick(value)}</text>`,
    );
  }
  return lines.join("");
}

function formatChartTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1);
}

function renderLegend(
  items: Array<{ name: string; color: string }>,
  w: number,
  h: number,
  theme: ThemeSpec,
): string {
  if (items.length === 0) return "";
  const y = h - 10;
  const itemWidth = Math.min(120, w / Math.max(1, items.length));
  return items
    .map((item, i) => {
      const x = CHART_PADDING.left + i * itemWidth;
      return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})"><rect x="0" y="-8" width="10" height="10" fill="${item.color}" rx="2" /><text x="14" y="0" font-size="10" fill="${theme.colors.textPrimary}">${escapeHtml(item.name)}</text></g>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Diagram rendering (SVG)
// ---------------------------------------------------------------------------

function buildDiagramElementHtml(
  element: DiagramElementIR,
  theme: ThemeSpec,
  slideWidth: number,
  slideHeight: number,
): string {
  const pos = frameToPercent(element.frame, slideWidth, slideHeight);
  const w = element.frame.width;
  const h = element.frame.height;
  const nodeFill = element.style?.nodeFill ?? theme.colors.surface;
  const nodeStroke = theme.colors.primary;
  const edgeColor = element.style?.edgeColor ?? theme.colors.textSecondary;
  const textColor = element.style?.textStyle?.color ?? theme.colors.textPrimary;

  const layout = layoutDiagramNodes(element, w, h);
  const nodeMap = new Map(layout.map((p) => [p.id, p]));

  const arrowDef = `<defs><marker id="diag-arrow-${escapeHtml(element.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${edgeColor}" /></marker></defs>`;

  const edges = (element.edges ?? []).map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return "";
    const path = computeEdgePath(from, to);
    const label = edge.label
      ? `<text x="${((from.cx + to.cx) / 2).toFixed(2)}" y="${((from.cy + to.cy) / 2 - 4).toFixed(2)}" text-anchor="middle" font-size="10" fill="${theme.colors.textSecondary}">${escapeHtml(edge.label)}</text>`
      : "";
    return `<line x1="${path.x1.toFixed(2)}" y1="${path.y1.toFixed(2)}" x2="${path.x2.toFixed(2)}" y2="${path.y2.toFixed(2)}" stroke="${edgeColor}" stroke-width="1.5" marker-end="url(#diag-arrow-${escapeHtml(element.id)})" />${label}`;
  });

  // For sequence-style diagrams without edges, draw implicit arrows between
  // consecutive nodes.
  if ((element.edges ?? []).length === 0 && isSequenceDiagram(element.diagramType)) {
    for (let i = 0; i < layout.length - 1; i++) {
      const from = layout[i];
      const to = layout[i + 1];
      const path = computeEdgePath(from, to);
      edges.push(
        `<line x1="${path.x1.toFixed(2)}" y1="${path.y1.toFixed(2)}" x2="${path.x2.toFixed(2)}" y2="${path.y2.toFixed(2)}" stroke="${edgeColor}" stroke-width="1.5" marker-end="url(#diag-arrow-${escapeHtml(element.id)})" />`,
      );
    }
  }

  const nodes = layout.map((node) => {
    return `<g transform="translate(${(node.cx - node.w / 2).toFixed(2)},${(node.cy - node.h / 2).toFixed(2)})"><rect width="${node.w.toFixed(2)}" height="${node.h.toFixed(2)}" rx="${theme.radius.md}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="1.5" /><text x="${(node.w / 2).toFixed(2)}" y="${(node.h / 2 + 4).toFixed(2)}" text-anchor="middle" font-size="12" fill="${textColor}" font-weight="600">${escapeHtml(node.label)}</text></g>`;
  });

  return `      <div class="element diagram-element" style="${pos}">
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${arrowDef}${edges.join("")}${nodes.join("")}</svg>
      </div>`;
}

type LaidOutNode = { id: string; label: string; cx: number; cy: number; w: number; h: number };

function isSequenceDiagram(kind: DiagramElementIR["diagramType"]): boolean {
  return kind === "flowchart" || kind === "timeline" || kind === "funnel" || kind === "layered";
}

function layoutDiagramNodes(element: DiagramElementIR, w: number, h: number): LaidOutNode[] {
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

  // Default: horizontal sequence.
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

function computeEdgePath(from: LaidOutNode, to: LaidOutNode) {
  // Trim the line to the box edge so the arrowhead lands on the border, not
  // inside the node.
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
