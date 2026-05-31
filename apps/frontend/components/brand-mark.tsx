import type { ComponentProps } from 'react';
// SVGR turns the favicon SSOT (`app/icon.svg`) into a React component on both the
// Next.js webpack build and Storybook's Vite build, so the shape is never
// redefined here. A plain (non-`?url`) import is the component; see
// `next.config.ts` and `.storybook/main.ts` for the matching SVGR wiring.
import Icon from '@/app/icon.svg';
import { cn } from '@/lib/utils';

type BrandMarkProps = ComponentProps<typeof Icon> & {
  /**
   * When set, the mark follows the app theme by overriding the brand CSS
   * variables (with `.dark` variants) instead of relying on the SVG fallbacks.
   */
  adaptive?: boolean;
};

/**
 * Thin wrapper around the favicon SSOT (`app/icon.svg`). The SVG shape is never
 * redefined here, so the favicon and the in-app brand mark cannot drift apart.
 */
export function BrandMark({ adaptive = false, className, ...props }: BrandMarkProps) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'shrink-0',
        adaptive && [
          '[--agentra-brand-bg:#1c1917]',
          '[--agentra-brand-fg:#fafaf9]',
          '[--agentra-brand-node:#a8a29e]',
          'dark:[--agentra-brand-bg:#e7e5e4]',
          'dark:[--agentra-brand-fg:#1c1917]',
          'dark:[--agentra-brand-node:#78716c]',
        ],
        className,
      )}
      {...props}
    />
  );
}
