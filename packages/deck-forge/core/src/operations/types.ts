import type {
  Asset,
  AssetUsage,
  ImageElementIR,
  LayoutSpec,
  RichText,
  SlideIntent,
  TableStyle,
  TextElementIR,
  TextStyle,
  ThemeSpec,
} from "#src/index.js";

export type PresentationOperation =
  | AddSlideOperation
  | RemoveSlideOperation
  | MoveSlideOperation
  | SetSlideLayoutOperation
  | AddTextOperation
  | UpdateTextOperation
  | AddChartOperation
  | UpdateChartDataOperation
  | DeleteElementOperation
  | AddImageOperation
  | AddTableOperation
  | AttachAssetOperation
  | ApplyThemeOperation;

export type AddSlideOperation = {
  type: "add_slide";
  slideId?: string;
  index?: number;
  title?: string;
  intent?: SlideIntent;
  layout: LayoutSpec;
};

export type AddTextOperation = {
  type: "add_text";
  slideId: string;
  elementId?: string;
  role: TextElementIR["role"];
  text: string | RichText;
  regionId?: string;
  style?: Partial<TextStyle>;
};

export type AddImageOperation = {
  type: "add_image";
  slideId: string;
  elementId?: string;
  assetId: string;
  role?: ImageElementIR["role"];
  regionId?: string;
};

export type AddTableOperation = {
  type: "add_table";
  slideId: string;
  elementId?: string;
  headers: string[];
  rows: string[][];
  regionId?: string;
  style?: TableStyle;
};

export type AddChartOperation = {
  type: "add_chart";
  slideId: string;
  elementId?: string;
  chartType: "bar" | "line" | "area" | "pie" | "scatter" | "combo";
  data: {
    series: Array<{
      name: string;
      values: number[];
    }>;
    categories?: string[];
  };
  encoding: {
    x?: string;
    y?: string;
    color?: string;
    size?: string;
  };
  regionId?: string;
  style?: {
    palette?: string[];
    showLegend?: boolean;
    showGrid?: boolean;
  };
};

export type UpdateChartDataOperation = {
  type: "update_chart_data";
  slideId: string;
  elementId: string;
  data: {
    series: Array<{
      name: string;
      values: number[];
    }>;
    categories?: string[];
  };
  encoding?: {
    x?: string;
    y?: string;
    color?: string;
    size?: string;
  };
  chartType?: "bar" | "line" | "area" | "pie" | "scatter" | "combo";
};

export type RemoveSlideOperation = {
  type: "remove_slide";
  slideId: string;
};

export type MoveSlideOperation = {
  type: "move_slide";
  slideId: string;
  toIndex: number;
};

export type UpdateTextOperation = {
  type: "update_text";
  slideId: string;
  elementId: string;
  text: string | RichText;
  style?: Partial<TextStyle>;
};

export type DeleteElementOperation = {
  type: "delete_element";
  slideId: string;
  elementId: string;
};

export type ApplyThemeOperation = {
  type: "apply_theme";
  theme: ThemeSpec;
};

export type SetSlideLayoutOperation = {
  type: "set_slide_layout";
  slideId: string;
  layout: LayoutSpec;
};

export type AttachAssetOperation = {
  type: "attach_asset";
  asset: Asset;
  /** Optional: bind this asset to a specific slide/element usage */
  slideId?: string;
  elementId?: string;
  role?: AssetUsage["role"];
};
