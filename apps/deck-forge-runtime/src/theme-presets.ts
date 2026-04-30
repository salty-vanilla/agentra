/**
 * Curated theme presets for executive-quality decks. The brief generation
 * pipeline picks one of these (via a small Bedrock tool_use call) and the
 * preset's color tokens + suggested fonts are injected into
 * `brief.brand.colors` / `brief.brand.fonts` before the deck IR is built.
 *
 * The shapes here intentionally match `ColorTokensPartialSchema` and
 * `FontFamilyPartialSchema` exported by `@deck-forge/core`.
 */

export type ThemePresetId =
  | 'executive-navy'
  | 'modern-mono'
  | 'warm-pastel'
  | 'tech-dark'
  | 'eco-fresh'
  | 'editorial-serif';

export type ThemeColorTokens = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  secondary: string;
  accent: string;
  success?: string;
  warning?: string;
  danger?: string;
  chartPalette: string[];
};

export type ThemeFonts = {
  heading: string;
  body: string;
  mono?: string;
};

export type ThemePreset = {
  id: ThemePresetId;
  /** Short human-readable label exposed to the picker LLM. */
  label: string;
  /** Best-fit usage hints the picker LLM uses to choose. */
  bestFor: string;
  colors: ThemeColorTokens;
  fonts: ThemeFonts;
};

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  'executive-navy': {
    id: 'executive-navy',
    label: 'Executive Navy',
    bestFor:
      'Board / C-suite reports, financial reviews, governance, formal business updates. Trustworthy, conservative.',
    colors: {
      background: '#FFFFFF',
      surface: '#F4F6FA',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      primary: '#1D4ED8',
      secondary: '#0F172A',
      accent: '#F59E0B',
      success: '#16A34A',
      warning: '#D97706',
      danger: '#DC2626',
      chartPalette: ['#1D4ED8', '#0EA5E9', '#F59E0B', '#16A34A', '#9333EA', '#475569'],
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
  },
  'modern-mono': {
    id: 'modern-mono',
    label: 'Modern Mono',
    bestFor:
      'Product / design pitches, internal team updates, modern tech-forward brands. Clean, restrained, plenty of whitespace.',
    colors: {
      background: '#FFFFFF',
      surface: '#F5F5F5',
      textPrimary: '#111111',
      textSecondary: '#525252',
      primary: '#111111',
      secondary: '#404040',
      accent: '#EF4444',
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      chartPalette: ['#111111', '#525252', '#A3A3A3', '#EF4444', '#10B981', '#F59E0B'],
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
  },
  'warm-pastel': {
    id: 'warm-pastel',
    label: 'Warm Pastel',
    bestFor:
      'Customer success stories, marketing kickoffs, education/training, friendly brand voice.',
    colors: {
      background: '#FFFBF5',
      surface: '#FFF1E0',
      textPrimary: '#3F2E1E',
      textSecondary: '#7A6650',
      primary: '#E07856',
      secondary: '#7C5E3C',
      accent: '#F2B33D',
      success: '#5BA86B',
      warning: '#E08A2A',
      danger: '#C24545',
      chartPalette: ['#E07856', '#F2B33D', '#7C5E3C', '#5BA86B', '#9C7BB8', '#3F84A8'],
    },
    fonts: {
      heading: 'Source Serif Pro',
      body: 'Inter',
    },
  },
  'tech-dark': {
    id: 'tech-dark',
    label: 'Tech Dark',
    bestFor:
      'Engineering deep-dives, architecture reviews, futuristic product demos, AI / data infra topics. High-contrast, dark mode.',
    colors: {
      background: '#0B1220',
      surface: '#111A2E',
      textPrimary: '#F8FAFC',
      textSecondary: '#94A3B8',
      primary: '#22D3EE',
      secondary: '#A78BFA',
      accent: '#F472B6',
      success: '#34D399',
      warning: '#FBBF24',
      danger: '#F87171',
      chartPalette: ['#22D3EE', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#F87171'],
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
  },
  'eco-fresh': {
    id: 'eco-fresh',
    label: 'Eco Fresh',
    bestFor:
      'Sustainability, ESG, healthcare, public sector, anything that benefits from a calm green palette.',
    colors: {
      background: '#FFFFFF',
      surface: '#EEF7EE',
      textPrimary: '#0F2A1D',
      textSecondary: '#3D5C49',
      primary: '#15803D',
      secondary: '#0F766E',
      accent: '#CA8A04',
      success: '#15803D',
      warning: '#CA8A04',
      danger: '#B91C1C',
      chartPalette: ['#15803D', '#0F766E', '#CA8A04', '#1D4ED8', '#7C3AED', '#525252'],
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
  },
  'editorial-serif': {
    id: 'editorial-serif',
    label: 'Editorial Serif',
    bestFor:
      'Research summaries, white papers, academic / policy briefings, reports where authority matters.',
    colors: {
      background: '#FBF9F4',
      surface: '#F1ECE0',
      textPrimary: '#1B1B1B',
      textSecondary: '#5C5C5C',
      primary: '#7A1F1F',
      secondary: '#1B1B1B',
      accent: '#B58900',
      success: '#3F6E3F',
      warning: '#B58900',
      danger: '#7A1F1F',
      chartPalette: ['#7A1F1F', '#B58900', '#3F6E3F', '#1B4F72', '#5C5C5C', '#9C5A1A'],
    },
    fonts: {
      heading: 'Source Serif Pro',
      body: 'Source Serif Pro',
    },
  },
};

export const THEME_PRESET_IDS = Object.keys(THEME_PRESETS) as ThemePresetId[];

export function getThemePreset(id: ThemePresetId | string): ThemePreset | undefined {
  return THEME_PRESETS[id as ThemePresetId];
}

/**
 * Compact summary the picker LLM sees. Keeping this small keeps the prompt
 * cheap and the choice deterministic.
 */
export function describeThemePresets(): string {
  return THEME_PRESET_IDS.map((id) => {
    const p = THEME_PRESETS[id];
    return `- ${id} ("${p.label}") — ${p.bestFor}`;
  }).join('\n');
}
