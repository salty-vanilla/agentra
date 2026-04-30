import type { AssetSpec, DeckPlan, PresentationBrief, SlideSpec } from "#src/index.js";

export type CreatePresentationSpecInput = {
  userRequest: string;
  audience?: string;
  goal?: string;
  slideCount?: number;
  tone?: string;
  outputFormat?: "pptx" | "pdf" | "html" | "json";
};

export type CreatePresentationSpecOutput = {
  brief: PresentationBrief;
};

export type GenerateDeckPlanInput = {
  brief: PresentationBrief;
};

export type GenerateDeckPlanOutput = {
  deckPlan: DeckPlan;
};

export type GenerateSlideSpecsInput = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
};

export type GenerateSlideSpecsOutput = {
  slideSpecs: SlideSpec[];
};

export type GenerateAssetPlanInput = {
  brief: PresentationBrief;
  slideSpecs: SlideSpec[];
  acquisitionMode?: "generate" | "retrieve" | "auto";
  imageProvider?: "pexels" | "unsplash" | "pixabay";
};

export type GenerateAssetPlanOutput = {
  assetSpecs: AssetSpec[];
};
