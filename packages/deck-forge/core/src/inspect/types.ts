import type {
  Asset,
  ElementIR,
  PresentationIR,
  ResolvedLayout,
  SlideIR,
  ValidationReport,
} from "#src/index.js";

export type InspectQuery = {
  include?: Array<"deck" | "slides" | "elements" | "text" | "layout" | "assets" | "validation">;
  slideId?: string;
  elementId?: string;
  targetId?: string;
};

export type ResolvedAnchor =
  | {
      kind: "deck";
      anchorId: string;
      id: string;
      target: PresentationIR;
    }
  | {
      kind: "slide";
      anchorId: string;
      id: string;
      target: SlideIR;
    }
  | {
      kind: "element";
      anchorId: string;
      id: string;
      target: ElementIR;
      slideId: string;
    }
  | {
      kind: "asset";
      anchorId: string;
      id: string;
      target: Asset;
    }
  | {
      kind: "comment";
      anchorId: string;
      id: string;
      target: {
        threadId: string;
        slideId: string;
      };
    }
  | {
      kind: "text_range";
      anchorId: string;
      id: string;
      target: {
        elementId?: string;
        rangeId: string;
      };
    };

export type InspectDeckSummary = {
  id: string;
  version: string;
  title: string;
  slideCount: number;
  meta: PresentationIR["meta"];
};

export type InspectTextRecord = {
  slideId: string;
  elementId: string;
  role: string;
  text: string;
};

export type InspectLayoutRecord = {
  slideId: string;
  layout: ResolvedLayout;
};

export type InspectResult = {
  deck?: InspectDeckSummary;
  slides?: SlideIR[];
  elements?: ElementIR[];
  text?: InspectTextRecord[];
  layout?: InspectLayoutRecord[];
  assets?: Asset[];
  validation?: ValidationReport;
  target?: ResolvedAnchor;
};
