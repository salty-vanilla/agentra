/**
 * Pure helpers for the deck Live Preview renderer.
 *
 * Adapted from aws-samples/sample-spec-driven-presentation-maker (MIT-0)
 * `AnimatedSlidePreview.tsx`, reduced to a STATIC build (no animation) for the
 * Agentra MVP. The compose/defs payloads are produced by our own pipeline
 * (#385/#386) from a LibreOffice SVG export — a trusted source.
 */

export const COMPOSE_VERSION = 1;

export interface ComposeBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComposeComponent {
  class: string;
  bbox: ComposeBBox | null;
  text: string;
  svg: string;
  changed: boolean;
}

export interface ComposeData {
  version: number;
  viewBox: string;
  bgFill: string;
  bgSvg: string | null;
  components: ComposeComponent[];
}

export interface DefsData {
  version: number;
  defs: string;
}

export function isComposeData(value: unknown): value is ComposeData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.viewBox === 'string' &&
    typeof v.bgFill === 'string' &&
    Array.isArray(v.components)
  );
}

export function isDefsData(value: unknown): value is DefsData {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).defs === 'string';
}

function backgroundMarkup(compose: ComposeData): string {
  if (compose.bgSvg) return `<g>${compose.bgSvg}</g>`;
  const [, , w = '0', h = '0'] = compose.viewBox.split(/\s+/);
  return `<rect width="${w}" height="${h}" fill="${compose.bgFill || '#000'}"/>`;
}

/**
 * Build the inner SVG markup for one slide: background, shared defs, then each
 * component group in order. Returns the markup that goes inside an `<svg>` whose
 * `viewBox` is {@link ComposeData.viewBox}.
 */
export function buildSlideInnerSvg(defs: string, compose: ComposeData): string {
  const parts: string[] = [backgroundMarkup(compose), defs];
  for (const component of compose.components) {
    parts.push(`<g>${component.svg}</g>`);
  }
  return parts.join('');
}
