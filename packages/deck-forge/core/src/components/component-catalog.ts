import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ComponentCatalog,
  ComponentPreflightResult,
  ComponentSpec,
  SlideSpec,
} from "#src/index.js";

const DEFAULT_COMPONENTS_DIR = path.join("templates", "components");

export type ComponentCatalogOptions = {
  componentsDir?: string;
};

export async function listComponents(options?: ComponentCatalogOptions): Promise<ComponentCatalog> {
  const componentsDir = options?.componentsDir ?? DEFAULT_COMPONENTS_DIR;
  await mkdir(componentsDir, { recursive: true });
  const entries = await readdir(componentsDir);
  const specs: ComponentSpec[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const payload = await readFile(path.join(componentsDir, entry), "utf8");
    specs.push(JSON.parse(payload) as ComponentSpec);
  }

  return {
    version: "1.0.0",
    components: specs.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function preflightComponents(
  slideSpecs: SlideSpec[],
  options?: ComponentCatalogOptions,
): Promise<ComponentPreflightResult> {
  const catalog = await listComponents(options);
  const existingIds = new Set(catalog.components.map((c) => c.id));
  const missing: Array<{
    slideId: string;
    requiredCapability: string;
    suggestedComponentId: string;
  }> = [];
  const matches: Array<{ slideId: string; componentId: string }> = [];

  for (const slide of slideSpecs) {
    const required = detectCapability(slide);
    const suggestion = suggestComponentId(required);
    if (existingIds.has(suggestion)) {
      matches.push({ slideId: slide.id, componentId: suggestion });
    } else {
      missing.push({
        slideId: slide.id,
        requiredCapability: required,
        suggestedComponentId: suggestion,
      });
    }
  }

  return {
    catalog,
    matches,
    missing,
  };
}

export async function synthesizeComponents(
  slideSpecs: SlideSpec[],
  options?: ComponentCatalogOptions,
): Promise<{ created: ComponentSpec[]; catalog: ComponentCatalog }> {
  const preflight = await preflightComponents(slideSpecs, options);
  const componentsDir = options?.componentsDir ?? DEFAULT_COMPONENTS_DIR;
  await mkdir(componentsDir, { recursive: true });

  const created: ComponentSpec[] = [];
  for (const miss of preflight.missing) {
    const spec = createComponentSpec(miss.suggestedComponentId, miss.requiredCapability);
    await writeFile(
      path.join(componentsDir, `${spec.id}.json`),
      JSON.stringify(spec, null, 2),
      "utf8",
    );
    created.push(spec);
  }

  return {
    created,
    catalog: await listComponents(options),
  };
}

/**
 * Detects the most appropriate component capability for a slide.
 *
 * Resolution order (highest specificity first):
 *   1. SlideIntent.type — opening/closing map to dedicated capabilities
 *      (title-slide, closing-cta) regardless of content blocks.
 *   2. LayoutSpec.type — explicit layout hints (comparison, dashboard,
 *      matrix, three_column, timeline, section, image_left_text_right,
 *      text_left_image_right, hero, diagram_focus, title) take priority
 *      over inferred content signals.
 *   3. ContentBlock signals — quote/metric-count/chart/table/image
 *      heuristics for slides without an explicit layout.type or intent
 *      cue.
 *   4. Fallback: two_column.
 */
function detectCapability(slide: SlideSpec): string {
  const types = new Set(slide.content.map((block) => block.type));
  const metricCount = slide.content.filter((block) => block.type === "metric").length;
  const calloutCount = slide.content.filter((block) => block.type === "callout").length;

  // 1) SlideIntent-driven mapping (the intent enum is the most reliable
  //    high-level cue: it survives even when LayoutSpec.type is the
  //    generic "single_column" default).
  switch (slide.intent?.type) {
    case "title":
      return "title_slide";
    case "agenda":
      return "agenda";
    case "closing":
      return "closing_cta";
    case "comparison":
      return "comparison";
    case "timeline":
      return "timeline_horizontal";
    case "process":
      return "process_flow";
    default:
      break;
  }

  // 2) Explicit LayoutSpec.type wins over inferred content signals
  switch (slide.layout.type) {
    case "title":
      return "title_slide";
    case "section":
      return "section_divider";
    case "comparison":
      return "comparison";
    case "three_column":
      return "three_column";
    case "matrix":
      return "matrix";
    case "dashboard":
      return "dashboard";
    case "timeline":
      return "timeline_horizontal";
    case "diagram_focus":
      return "diagram_focus";
    case "image_left_text_right":
      return "image_left_text_right";
    case "text_left_image_right":
      return "text_left_image_right";
    case "hero":
      return "hero_visual";
    default:
      break;
  }

  // 3) Content-block heuristics
  if (types.has("quote")) return "quote_spotlight";
  if (types.has("chart") && metricCount >= 2) return "dashboard";
  if (types.has("chart")) return "chart_focus";
  if (types.has("diagram")) return "diagram_focus";
  if (metricCount >= 2) return "metric_row";
  if (types.has("table")) return "kpi_grid";
  if (types.has("image")) return "hero_visual";
  if (calloutCount === 1 && slide.content.length <= 3) return "callout_spotlight";

  // 4) Fallback
  return "two_column";
}

function suggestComponentId(capability: string): string {
  switch (capability) {
    case "title_slide":
      return "title-slide";
    case "section_divider":
      return "section-divider";
    case "agenda":
      return "agenda";
    case "closing_cta":
      return "closing-cta";
    case "thank_you":
      return "thank-you";
    case "qa":
      return "qa";
    case "quote_spotlight":
      return "quote-spotlight";
    case "chart_focus":
      return "chart-focus";
    case "kpi_grid":
      return "kpi-grid";
    case "hero_visual":
      return "hero-visual";
    case "comparison":
      return "comparison";
    case "three_column":
      return "three-column";
    case "matrix":
      return "matrix-2x2";
    case "dashboard":
      return "dashboard";
    case "diagram_focus":
      return "diagram-focus";
    case "image_left_text_right":
      return "image-left-text-right";
    case "text_left_image_right":
      return "text-left-image-right";
    case "metric_row":
      return "metric-row";
    case "callout_spotlight":
      return "callout-spotlight";
    case "timeline":
    case "timeline_horizontal":
      return "timeline-horizontal";
    case "process_flow":
      return "process-flow";
    default:
      return "two-column";
  }
}

function createComponentSpec(id: string, capability: string): ComponentSpec {
  return {
    id,
    version: "1.0.0",
    capability,
    propsSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title"],
    },
    slotSchema: ["title", "body", "visual"],
    layoutContract: {
      variant: capability,
      regionRoles: ["title", "body", "visual"],
    },
  };
}
