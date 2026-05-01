import type { ContentBlock, LayoutSpec, SlideSpec } from "#src/index.js";
import type { TemplateLayoutProfile, TemplateProfile } from "#src/templates/template-profile.js";

export type ResolveTemplateLayoutInput = {
  slideSpec: SlideSpec;
  layoutSpec: LayoutSpec;
  blocks: ContentBlock[];
  selectedStrategyId?: string;
  templateProfile: TemplateProfile;
};

export type ResolveTemplateLayoutOutput = {
  layout: TemplateLayoutProfile;
  reason: string;
};

const STRATEGY_TO_LAYOUT: Record<string, string> = {
  "executive-summary-kpi": "dashboard-cards",
  "kpi-dashboard-with-insight": "visual-insight",
  "small-multiples-trend": "dashboard-cards",
  "data-insight-story": "visual-insight",
  "process-flow-with-impact": "process",
  "implementation-roadmap": "process",
  "action-plan-table": "table",
  "decision-request": "content-standard",
};

const LAYOUT_TYPE_TO_KIND: Record<string, string> = {
  title: "cover",
  cover: "cover",
  section: "section",
  dashboard: "dashboard-cards",
  table: "table",
  two_column: "content-two-column",
  text_left_image_right: "content-two-column",
  image_left_text_right: "content-two-column",
  comparison: "content-two-column",
};

function findLayout(
  profile: TemplateProfile,
  layoutId: string,
): TemplateLayoutProfile | undefined {
  return profile.layouts.find((l) => l.id === layoutId);
}

export function resolveTemplateLayout(
  input: ResolveTemplateLayoutInput,
): ResolveTemplateLayoutOutput {
  const { layoutSpec, selectedStrategyId, templateProfile } = input;

  // 1. Match by layout spec type
  const typeMatch = LAYOUT_TYPE_TO_KIND[layoutSpec.type];
  if (typeMatch) {
    const layout = findLayout(templateProfile, typeMatch);
    if (layout) {
      return { layout, reason: `layoutSpec.type="${layoutSpec.type}" -> ${layout.id}` };
    }
  }

  // 2. Match by strategy id
  if (selectedStrategyId) {
    const strategyMatch = STRATEGY_TO_LAYOUT[selectedStrategyId];
    if (strategyMatch) {
      const layout = findLayout(templateProfile, strategyMatch);
      if (layout) {
        return { layout, reason: `strategyId="${selectedStrategyId}" -> ${layout.id}` };
      }
    }
  }

  // 3. Fallback to content-standard
  const fallback =
    findLayout(templateProfile, "content-standard") ??
    templateProfile.layouts.find((l) => l.kind === "content") ??
    templateProfile.layouts[0];

  if (!fallback) {
    // Should never happen with a valid profile, but be safe
    return {
      layout: { id: "blank", name: "Blank", kind: "blank", slots: {} },
      reason: "no layouts in profile, using blank",
    };
  }

  return { layout: fallback, reason: `fallback -> ${fallback.id}` };
}
