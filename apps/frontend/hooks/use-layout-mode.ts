import * as React from 'react';

/**
 * Admin Console layout mode (Issue #366).
 *
 * The design vocabulary is fixed to `Compact / Medium / Expanded` regardless of
 * the underlying breakpoints:
 * - `compact`  : mobile / narrow viewport — list and detail never shown together.
 * - `medium`   : normal desktop / laptop / FHD — modal Drawer overlay for detail.
 * - `expanded` : wide desktop / WQHD / 4K — non-modal side panel for detail.
 */
export type LayoutMode = 'compact' | 'medium' | 'expanded';

// Breakpoints map onto Tailwind's `md` (768px) and `2xl` (1536px) so the layout
// switches at the same widths the utility classes already use elsewhere.
export const MEDIUM_MIN_WIDTH = 768; // Tailwind `md`
export const EXPANDED_MIN_WIDTH = 1536; // Tailwind `2xl`

export function resolveLayoutMode(width: number): LayoutMode {
  if (width < MEDIUM_MIN_WIDTH) return 'compact';
  if (width < EXPANDED_MIN_WIDTH) return 'medium';
  return 'expanded';
}

export function useLayoutMode(): LayoutMode {
  // Default to `medium` so SSR and first paint match the most common desktop
  // case; the effect corrects it to the real viewport on mount.
  const [mode, setMode] = React.useState<LayoutMode>('medium');

  React.useEffect(() => {
    const update = () => setMode(resolveLayoutMode(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return mode;
}
