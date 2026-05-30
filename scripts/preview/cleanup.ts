/**
 * `pnpm preview:cleanup [--dry-run | --execute] [--stage <stage>] [--confirm <token>]`
 *
 * Detects stale preview environments account-wide and (in `--execute` mode)
 * tears down only stacks that are BOTH expired (`ExpiresAt` in the past) AND pass
 * the same two-layer name+tag safety validation as `preview:destroy` (#317). The
 * default mode is read-only dry-run reporting.
 *
 * A stack is classified using its own `Stage` tag (validated before use). Execute
 * destroys the eligible stacks grouped by stage via `cdk destroy` for explicit
 * validated stack names (never `--all`). Execute requires `--confirm <stage>` when
 * scoped with `--stage`, or `--confirm all` for an account-wide run.
 *
 * AI safety: this is a guarded teardown path. Direct `cdk destroy --all` and ad-hoc
 * AWS deletion commands are not allowed.
 */

import { parseCleanupArgs } from './cleanup-args.js';
import {
  cleanupDestroyByStage,
  describePreviewCandidates,
  resolveCleanupIdentity,
} from './cli-runtime.js';
import { writeJsonFile } from './io.js';
import { type CleanupRuntime, runCleanup } from './run-cleanup.js';

function main(): void {
  const args = parseCleanupArgs(process.argv.slice(2));

  const runtime: CleanupRuntime = {
    resolveIdentity: resolveCleanupIdentity,
    describeCandidates: describePreviewCandidates,
    executeDestroyByStage: cleanupDestroyByStage,
    writeReport: writeJsonFile,
    log: (message) => console.log(message),
    now: () => new Date(),
  };

  const report = runCleanup(args, runtime);
  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`preview:cleanup failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
