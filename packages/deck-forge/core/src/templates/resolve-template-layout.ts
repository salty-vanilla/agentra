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
  "executive-summary-kpi": "dashboard-cards",
  "kpi-dashboard-with-insight": "visual-insight",
  "small-multiples-trend": "dashboard-cards",
  "data-insight-story": "visual-insight",
  "process-flow-with-impact": "process",
  "implementation-roadmap": "process",
  "action-plan-table": "table",
  "decision-request": "content-standard",
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
