import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPANDED_MIN_WIDTH,
  MEDIUM_MIN_WIDTH,
  resolveLayoutMode,
  useLayoutMode,
} from '../use-layout-mode';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

describe('resolveLayoutMode', () => {
  it('returns compact below the medium breakpoint', () => {
    expect(resolveLayoutMode(390)).toBe('compact');
    expect(resolveLayoutMode(MEDIUM_MIN_WIDTH - 1)).toBe('compact');
  });

  it('returns medium between the medium and expanded breakpoints', () => {
    expect(resolveLayoutMode(MEDIUM_MIN_WIDTH)).toBe('medium');
    expect(resolveLayoutMode(1280)).toBe('medium');
    expect(resolveLayoutMode(EXPANDED_MIN_WIDTH - 1)).toBe('medium');
  });

  it('returns expanded at and above the expanded breakpoint', () => {
    expect(resolveLayoutMode(EXPANDED_MIN_WIDTH)).toBe('expanded');
    expect(resolveLayoutMode(1920)).toBe('expanded');
  });
});

describe('useLayoutMode', () => {
  afterEach(() => {
    setViewportWidth(1280);
  });

  it('reflects the current viewport width on mount', () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('compact');
  });

  it('updates the mode when the viewport is resized', () => {
    setViewportWidth(1280);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('medium');

    setViewportWidth(1920);
    expect(result.current).toBe('expanded');

    setViewportWidth(500);
    expect(result.current).toBe('compact');
  });
});
