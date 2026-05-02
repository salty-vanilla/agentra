import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'infra/cdk/cdk.out/**'],
  },
  resolve: {
    conditions: ['source'],
  },
});
