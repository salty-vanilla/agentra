import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['html']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: '**/smoke.test.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual-evidence',
      testMatch: '**/visual-evidence.test.ts',
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'on',
        video: 'on',
        trace: 'on',
      },
    },
    {
      // Diagnostic-only performance probe. Kept separate from normal E2E so we
      // can force stronger trace/screenshot capture and run sequentially in a
      // single worker (the combined results JSON aggregates across all tests).
      name: 'modal-performance',
      testMatch: '**/modal-performance.test.ts',
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'on',
        video: 'off',
        trace: 'on',
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE ?? 'mock',
    },
  },
});
