import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { mswServer } from './msw-server';

// jsdom does not implement matchMedia; next-themes (and other media-query aware
// code) reads it on mount. Provide a minimal light-preference stub.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  cleanup();
  mswServer.resetHandlers();
});
afterAll(() => mswServer.close());
