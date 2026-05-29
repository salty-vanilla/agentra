/**
 * `pnpm preview:destroy --stage <preview-stage> --profile <preview-profile> [--confirm <stage>] [--dry-run]`
 *
 * Safely tears down a disposable preview environment. A stack is destroyed ONLY
 * when its CloudFormation name is under `AgentraPreview-<stage>-` AND its live
 * tags identify it as an Agentra preview stack for that stage. Destruction uses
 * `cdk destroy` for explicit validated stack names (never `--all`); tags are
 * validated first via read-only `aws cloudformation describe-stacks`.
 *
 * `--profile` is the preview profile (minimal-api | backend-ai | full) and must
 * match the profile used for deploy so CDK can synth the same stacks. For a real
 * destroy, `--confirm <stage>` must exactly match `--stage`. `--dry-run` performs
 * no mutation and writes a dry-run report.
 *
 * AI safety: this is the single allowed path for AI-assisted preview teardown.
 * Direct `cdk destroy --all` and direct AWS deletion commands are not allowed.
 */

import {
  describePreviewCandidates,
  destroyPreviewStacks,
  resolveAndReportIdentity,
} from './cli-runtime.js';
import { parseDestroyArgs } from './destroy-args.js';
import { ensurePreviewDir, writeJsonFile } from './io.js';
import { resolvePreviewConfig } from './preview-stage.js';
import { type DestroyRuntime, runDestroy } from './run-destroy.js';

function main(): void {
  const args = parseDestroyArgs(process.argv.slice(2));

  // Validate stage/profile up front and ensure the artifact dir exists so the
  // report can always be written.
  const config = resolvePreviewConfig(args);
  ensurePreviewDir(config.stage);

  const runtime: DestroyRuntime = {
    resolveIdentity: resolveAndReportIdentity,
    describeCandidates: describePreviewCandidates,
    executeDestroy: destroyPreviewStacks,
    writeReport: writeJsonFile,
    log: (message) => console.log(message),
    now: () => new Date(),
  };

  const report = runDestroy(args, runtime);
  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`preview:destroy failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
