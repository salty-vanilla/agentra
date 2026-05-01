import type { ResolvedFrame } from "#src/index.js";

export type TemplateLayoutKind =
  | "cover"
  | "section"
  | "content"
  | "two-column"
  | "dashboard"
  | "visual-insight"
  | "table"
  | "process"
  | "blank";

export type TemplateSlotName =
  | "title"
  | "subtitle"
  | "main"
  | "body"
  | "left"
  | "right"
  | "visual"
  | "table"
  | "metrics"
  | "cards"
  | "process"
  | "insight"
  | "callout"
  | "footer"
  | "cta";

export type TemplateLayoutProfile = {
  id: string;
  name: string;
  kind: TemplateLayoutKind;
  aliases?: string[];
  slots: Partial<Record<TemplateSlotName, ResolvedFrame>>;
  instructions?: string;
};

export type TemplateProfile = {
  id: string;
  name: string;
  slideSize: {
    width: number;
    height: number;
    unit: "px";
  };
  themeId?: string;
  layouts: TemplateLayoutProfile[];
};
