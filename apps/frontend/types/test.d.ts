import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: standard jest-dom augmentation pattern requires any
  interface Assertion<T = any> extends TestingLibraryMatchers<T, void> {}
  // biome-ignore lint/suspicious/noExplicitAny: standard jest-dom augmentation pattern requires any
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, void> {}
}
