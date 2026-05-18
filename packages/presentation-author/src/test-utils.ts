import { accessSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Check if the presentation sandbox runtime is available.
 * Used by tests to conditionally skip sandbox-dependent tests.
 */
export function isSandboxRuntimeAvailable(): boolean {
  const fromEnv = process.env.PRESENTATION_SANDBOX_RUNTIME_DIR?.trim();
  if (fromEnv) {
    try {
      accessSync(fromEnv);
      return true;
    } catch {
      return false;
    }
  }

  // Check local .sandbox-runtime relative to package root.
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const localDir = join(pkgRoot, '.sandbox-runtime');
  try {
    accessSync(localDir);
    return true;
  } catch {
    // Noop
  }

  // Check global default
  try {
    accessSync('/opt/presentation-sandbox-runtime');
    return true;
  } catch {
    return false;
  }
}
