import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnimatedSlideOverlay } from '@/components/animated-slide-overlay';
import type { AnimBox } from '@/lib/deck-anim';

function box(index: number): AnimBox {
  return {
    index,
    leftPct: index * 10,
    topPct: index * 10,
    widthPct: 20,
    heightPct: 20,
    cxPct: index * 10 + 10,
    cyPct: index * 10 + 10,
  };
}

describe('AnimatedSlideOverlay', () => {
  it('renders nothing when there are no boxes', () => {
    const { container } = render(<AnimatedSlideOverlay boxes={[]} runKey="x" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a wireframe + cursor per box, aria-hidden', () => {
    render(<AnimatedSlideOverlay boxes={[box(0), box(1)]} runKey="c1" />);
    const overlay = screen.getByTestId('animated-slide-overlay');
    expect(overlay).toHaveAttribute('aria-hidden');
    // 2 boxes → 2 wrapper divs each holding a wireframe + a cursor.
    const wireframes = overlay.querySelectorAll('.border-dashed');
    expect(wireframes).toHaveLength(2);
  });
});
