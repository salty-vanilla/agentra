'use client';

import type * as React from 'react';
import { cn } from '@/lib/utils';

type BrandMarkProps = React.SVGProps<SVGSVGElement> & {
  adaptive?: boolean;
};

export function BrandMark({ adaptive = false, className, ...props }: BrandMarkProps) {
  return (
    <svg
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
      fill="none"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect
        fill="var(--agentra-brand-bg, #1c1917)"
        height="864"
        rx="128"
        width="864"
        x="80"
        y="80"
      />
      <path
        d="M304 732 L468 348 C484 310 540 310 556 348 L720 732"
        stroke="var(--agentra-brand-fg, #fafaf9)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="116"
      />
      <rect
        fill="var(--agentra-brand-node, #a8a29e)"
        height="100"
        rx="16"
        width="100"
        x="462"
        y="642"
      />
    </svg>
  );
}
