import { describe, expect, test } from 'vitest';
import {
  cdkOutputsPath,
  destroyDryRunPath,
  destroyResultPath,
  envBackendPath,
  envFrontendPath,
  manifestPath,
  planPath,
  previewDir,
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
});
