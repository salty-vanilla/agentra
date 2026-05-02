/**
 * Minimal default template profile used when no specific profile is provided.
 * This is intentionally plain — it provides basic content layouts without
 * any audience-specific or brand-specific styling.
 */

import type { TemplateProfile } from "#src/templates/template-profile.js";

export const MINIMAL_TEMPLATE_PROFILE: TemplateProfile = {
  id: "minimal-default",
  name: "Minimal Default",
  slideSize: { width: 1280, height: 720, unit: "px" },
  layouts: [
    {
      id: "cover",
      name: "Cover",
      kind: "cover",
      slots: {
        title: { x: 120, y: 220, width: 1040, height: 120 },
        subtitle: { x: 120, y: 360, width: 1040, height: 60 },
      },
    },
    {
      id: "section",
      name: "Section",
      kind: "section",
      slots: {
        title: { x: 120, y: 280, width: 1040, height: 100 },
      },
    },
    {
      id: "content-standard",
      name: "Content Standard",
      kind: "content",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        body: { x: 60, y: 110, width: 1160, height: 560 },
      },
    },
    {
      id: "content-two-column",
      name: "Two Column",
      kind: "two-column",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        left: { x: 60, y: 110, width: 560, height: 560 },
        right: { x: 660, y: 110, width: 560, height: 560 },
      },
    },
    {
      id: "dashboard-cards",
      name: "Dashboard Cards",
      kind: "dashboard",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        cards: { x: 60, y: 110, width: 1160, height: 560 },
      },
    },
    {
      id: "table",
      name: "Table",
      kind: "table",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        table: { x: 60, y: 110, width: 1160, height: 560 },
      },
    },
    {
      id: "visual-left-insight-right",
      name: "Visual + Insight",
      kind: "visual-insight",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        visual: { x: 60, y: 110, width: 560, height: 560 },
        insight: { x: 660, y: 110, width: 560, height: 560 },
      },
    },
    {
      id: "process",
      name: "Process",
      kind: "process",
      slots: {
        title: { x: 60, y: 30, width: 1160, height: 60 },
        process: { x: 60, y: 110, width: 1160, height: 560 },
      },
    },
    {
      id: "blank",
      name: "Blank",
      kind: "blank",
      slots: {},
    },
  ],
};
