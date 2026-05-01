import type { TemplateProfile } from "#src/templates/template-profile.js";

export const EXECUTIVE_NAVY_TEMPLATE_PROFILE: TemplateProfile = {
  id: "executive-navy-v1",
  name: "Executive Navy v1",
  slideSize: { width: 1280, height: 720, unit: "px" },
  themeId: "executive-navy",
  layouts: [
    {
      id: "cover",
      name: "Cover",
      kind: "cover",
      slots: {
        title: { x: 120, y: 250, width: 1040, height: 90 },
        subtitle: { x: 120, y: 350, width: 1040, height: 50 },
        footer: { x: 80, y: 650, width: 1120, height: 40 },
      },
    },
    {
      id: "section",
      name: "Section",
      kind: "section",
      slots: {
        title: { x: 120, y: 260, width: 1040, height: 90 },
        subtitle: { x: 120, y: 365, width: 1040, height: 52 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "content-standard",
      name: "Content Standard",
      kind: "content",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        main: { x: 80, y: 170, width: 1120, height: 340 },
        body: { x: 80, y: 170, width: 1120, height: 340 },
        callout: { x: 80, y: 540, width: 1120, height: 88 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "content-two-column",
      name: "Content Two Column",
      kind: "two-column",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        left: { x: 80, y: 170, width: 540, height: 340 },
        right: { x: 660, y: 170, width: 540, height: 340 },
        callout: { x: 80, y: 540, width: 1120, height: 88 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "dashboard-cards",
      name: "Dashboard Cards",
      kind: "dashboard",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        metrics: { x: 80, y: 160, width: 1120, height: 140 },
        cards: { x: 80, y: 320, width: 1120, height: 170 },
        callout: { x: 80, y: 530, width: 1120, height: 90 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "visual-insight",
      name: "Visual Insight",
      kind: "visual-insight",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        visual: { x: 80, y: 170, width: 660, height: 340 },
        insight: { x: 780, y: 170, width: 420, height: 220 },
        callout: { x: 780, y: 420, width: 420, height: 110 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "table",
      name: "Table",
      kind: "table",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        table: { x: 80, y: 160, width: 1120, height: 360 },
        cta: { x: 80, y: 550, width: 1120, height: 86 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
      },
    },
    {
      id: "process",
      name: "Process",
      kind: "process",
      slots: {
        title: { x: 80, y: 56, width: 1120, height: 72 },
        process: { x: 80, y: 170, width: 1120, height: 300 },
        callout: { x: 80, y: 510, width: 1120, height: 100 },
        footer: { x: 80, y: 650, width: 1120, height: 32 },
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
