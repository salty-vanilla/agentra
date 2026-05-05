import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const DEFAULT_RENDER_SIZE = 128;
const DEFAULT_STROKE_COLOR = '#333333';

export type IconStyle = {
  /** Stroke color for line icons. Replaces `currentColor`. Default: '#333333' */
  strokeColor?: string | undefined;
  /** Fill color. Replaces `fill="none"` if set. */
  fillColor?: string | undefined;
  /** Render size in pixels (square). Default: 128 */
  size?: number | undefined;
};

/**
 * Render an SVG file to PNG buffer with optional style overrides.
 *
 * - Replaces `stroke="currentColor"` with the given strokeColor
 * - Scales the SVG to the requested size
 * - Returns a PNG buffer ready for PptxGenJS embedding
 */
export async function renderSvgToPng(
  svgPath: string,
  style?: IconStyle | undefined,
): Promise<Buffer> {
  const raw = await readFile(svgPath, 'utf-8');
  return renderSvgStringToPng(raw, style);
}

/**
 * Render an SVG string to PNG buffer with optional style overrides.
 */
export function renderSvgStringToPng(
  svgString: string,
  style?: IconStyle | undefined,
): Buffer {
  const size = style?.size ?? DEFAULT_RENDER_SIZE;
  const strokeColor = style?.strokeColor ?? DEFAULT_STROKE_COLOR;

  let svg = svgString;

  // Replace currentColor with the actual stroke color
  svg = svg.replace(/stroke="currentColor"/g, `stroke="${strokeColor}"`);

  // Optionally replace fill
  if (style?.fillColor) {
    svg = svg.replace(/fill="none"/g, `fill="${style.fillColor}"`);
  }

  // Force SVG dimensions to render size
  svg = svg.replace(/width="\d+"/, `width="${size}"`);
  svg = svg.replace(/height="\d+"/, `height="${size}"`);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0, 0, 0, 0)', // transparent background
  });

  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}
