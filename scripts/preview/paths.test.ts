import { isAbsolute } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  cdkOutputsPath,
  cdkOutputsPathForCdk,
  destroyDryRunPath,
  destroyResultPath,
  envBackendPath,
  envFrontendPath,
  manifestPath,
  planPath,
  previewDir,
  smokeResultPath,
} from './paths.js';

describe('preview artifact paths', () => {
  const stage = 'local-nakatsuka-a1b2c3d';

  test('roots all artifacts under .agentra/preview/<stage>/', () => {
    expect(previewDir(stage)).toBe('.agentra/preview/local-nakatsuka-a1b2c3d');
  });

  test('produces the expected per-artifact paths', () => {
    expect(planPath(stage)).toBe('.agentra/preview/local-nakatsuka-a1b2c3d/plan.json');
    expect(cdkOutputsPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/cdk-outputs.json',
    );
    expect(manifestPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/manifest.json',
    );
    expect(envBackendPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/env.backend',
    );
    expect(envFrontendPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/env.frontend',
    );
  });

  test('produces the destroy report paths', () => {
    expect(destroyResultPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/destroy-result.json',
    );
    expect(destroyDryRunPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/destroy-dry-run.json',
    );
  });

  test('produces the smoke result path', () => {
    expect(smokeResultPath(stage)).toBe(
      '.agentra/preview/local-nakatsuka-a1b2c3d/smoke-result.json',
    );
  });

  // Regression: cdk runs with cwd=infra/cdk (pnpm --filter exec), so the
  // --outputs-file handed to cdk must be absolute. A relative path is written
  // under infra/cdk/.agentra/... and preview:deploy (at repo root) fails to
  // read it back (ENOENT), which breaks the deploy -> outputs -> smoke chain.
  test('cdkOutputsPathForCdk is absolute and resolves to the relative artifact path', () => {
    const forCdk = cdkOutputsPathForCdk(stage);
    expect(isAbsolute(forCdk)).toBe(true);
    expect(forCdk.endsWith(cdkOutputsPath(stage))).toBe(true);
  });
});
