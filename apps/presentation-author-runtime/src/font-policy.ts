export const FONT_POLICY_STYLE_GUIDE = `Font policy:
- Default Japanese font: BIZ UDPGothic (fallback: Noto Sans CJK JP)
- Default Latin font: Arial
- Use BIZ UDGothic + Arial for table/numeric-heavy slides when helpful
- Use BIZ UDPMincho + Georgia only for research/formal title-heavy decks
- Always set explicit theme fonts in PptxGenJS
- Avoid relying on PowerPoint default fonts`;

export interface FontPreset {
  japanese: string;
  latin: string;
  useCase: string;
}

export const FONT_PRESETS: Record<string, FontPreset> = {
  standard: {
    japanese: 'BIZ UDPGothic',
    latin: 'Arial',
    useCase: '基本形 / general business',
  },
  readable: {
    japanese: 'BIZ UDGothic',
    latin: 'Verdana',
    useCase: '読みやすさ重視 / text-heavy',
  },
  'product-lp': {
    japanese: 'BIZ UDPGothic',
    latin: 'Trebuchet MS',
    useCase: 'プロダクト紹介・LP風',
  },
  'research-elegant': {
    japanese: 'BIZ UDPMincho',
    latin: 'Georgia',
    useCase: '研究・上品なタイトル',
  },
  'table-numeric': {
    japanese: 'BIZ UDGothic',
    latin: 'Arial',
    useCase: '表・数値多め',
  },
};
