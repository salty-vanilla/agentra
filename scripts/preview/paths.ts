/**
 * Local artifact paths for preview environments.
 *
 * All preview artifacts live under `.agentra/preview/<stage>/` (gitignored via
 * `.agentra/`). Paths are relative to the process working directory, which is
 * the repo root when commands run via the root `pnpm preview:*` scripts.
 */
import { join } from 'node:path';

/** Root directory under which per-stage preview artifacts are written. */
export const PREVIEW_ARTIFACT_ROOT = join('.agentra', 'preview');

export function previewDir(stage: string): string {
  return join(PREVIEW_ARTIFACT_ROOT, stage);
}

export function planPath(stage: string): string {
  return join(previewDir(stage), 'plan.json');
}

export function cdkOutputsPath(stage: string): string {
  return join(previewDir(stage), 'cdk-outputs.json');
}

export function manifestPath(stage: string): string {
  return join(previewDir(stage), 'manifest.json');
}

export function envBackendPath(stage: string): string {
  return join(previewDir(stage), 'env.backend');
}

export function envFrontendPath(stage: string): string {
  return join(previewDir(stage), 'env.frontend');
}

export function destroyResultPath(stage: string): string {
  return join(previewDir(stage), 'destroy-result.json');
}

export function destroyDryRunPath(stage: string): string {
  return join(previewDir(stage), 'destroy-dry-run.json');
}

export function smokeResultPath(stage: string): string {
  return join(previewDir(stage), 'smoke-result.json');
}

/**
 * Cleanup is account-wide rather than per-stage, so its artifacts live under a
 * timestamped directory: `.agentra/preview/cleanup/<timestamp>/`. `timestamp`
 * must be filesystem-safe (e.g. ISO 8601 with `:`/`.` replaced by `-`).
 */
export function cleanupDir(timestamp: string): string {
  return join(PREVIEW_ARTIFACT_ROOT, 'cleanup', timestamp);
}

export function cleanupDryRunPath(timestamp: string): string {
  return join(cleanupDir(timestamp), 'cleanup-dry-run.json');
}

export function cleanupResultPath(timestamp: string): string {
  return join(cleanupDir(timestamp), 'cleanup-result.json');
}
