import { defineConfig } from 'vitest/config';

/**
 * Preview CLI test config.
 *
 * `root` is pinned to this directory so the run only discovers preview tests
 * under `scripts/preview/`. Without this, invoking `vitest run scripts/preview/`
 * from the repo root treats the path as a name filter and also matches stale
 * copies under `.worktrees/**` and `infra/cdk/cdk.out/**`, inflating the run.
 */
export default defineConfig({
  test: {
    root: __dirname,
    include: ['**/*.test.ts'],
  },
});
