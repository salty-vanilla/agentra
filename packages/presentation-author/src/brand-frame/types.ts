export type BrandFrameImagePlacement = {
  imagePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrandFrameSafeArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrandFrame = {
  id: string;
  name: string;
  description?: string;
  slideSize: {
    width: number;
    height: number;
    layout?: 'LAYOUT_WIDE' | 'LAYOUT_4X3' | string;
  };
  header?: BrandFrameImagePlacement;
  footer?: BrandFrameImagePlacement;
  safeArea: BrandFrameSafeArea;
  guidance?: string[];
};
