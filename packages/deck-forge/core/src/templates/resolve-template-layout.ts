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

const STRATEGY_TO_LAYOUT_ID: Record<string, string> = {
  "kpi-card-overview": "dashboard-cards",
  "kpi-dashboard-with-insight": "dashboard-cards-with-chart",
  "small-multiples-trend": "visual-top-insight-bottom",
  "data-insight-story": "visual-left-insight-right",
  "process-flow-with-impact": "process-with-impact",
  "implementation-roadmap": "roadmap-horizontal",
  "action-plan-table": "table-with-cta",
  "decision-request": "approval-with-kpi-sidecar",
  "layered-architecture": "architecture-layered",
  "one-message-summary": "message-focus",
  "recommendation-comparison": "comparison-two-column",
};

const SPECIAL_LAYOUT_TYPE_TO_LAYOUT_ID: Record<string, string> = {
  title: "cover",
  cover: "cover",
  section: "section",
};

const GENERIC_LAYOUT_TYPE_TO_LAYOUT_ID: Record<string, string> = {
  dashboard: "dashboard-cards",
  table: "table",
  two_column: "content-two-column",
  text_left_image_right: "visual-left-insight-right",
  image_left_text_right: "visual-left-insight-right",
  comparison: "comparison-two-column",
  timeline: "roadmap-horizontal",
  matrix: "matrix-with-insight",
  diagram_focus: "visual-left-insight-right",
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

  // 1. Special slide types always win (title, cover, section)
  const specialLayoutId = SPECIAL_LAYOUT_TYPE_TO_LAYOUT_ID[layoutSpec.type];
  if (specialLayoutId) {
    const layout = findLayout(templateProfile, specialLayoutId);
    if (layout) {
      return { layout, reason: `special layoutSpec.type="${layoutSpec.type}" -> ${layout.id}` };
    }
  }

  // 2. Business strategy wins over generic layoutSpec.type
  if (selectedStrategyId) {
    const strategyLayoutId = STRATEGY_TO_LAYOUT_ID[selectedStrategyId];
    if (strategyLayoutId) {
      const layout = findLayout(templateProfile, strategyLayoutId);
      if (layout) {
        return { layout, reason: `strategyId="${selectedStrategyId}" -> ${layout.id}` };
      }
    }
  }

  // 3. Generic layout type fallback
  const genericLayoutId = GENERIC_LAYOUT_TYPE_TO_LAYOUT_ID[layoutSpec.type];
  if (genericLayoutId) {
    const layout = findLayout(templateProfile, genericLayoutId);
    if (layout) {
      return { layout, reason: `generic layoutSpec.type="${layoutSpec.type}" -> ${layout.id}` };
    }
  }

  // 4. Fallback to content-standard
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
