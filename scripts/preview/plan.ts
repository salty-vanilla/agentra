/**
 * `pnpm preview:plan --stage <preview-stage> --profile <profile>`
 *
 * Validates the stage/profile/TTL via the guardrail library, asserts AWS
 * identity, synthesizes the preview CDK context (no AWS mutation), lists the
 * intended preview stacks, and writes `.agentra/preview/<stage>/plan.json`.
 *
 * Safe for AI-assisted use: read-only against AWS. It never deploys, mutates,
 * or uses `cdk deploy --all`.
 */

import {
  listPreviewStacks,
  resolveAndReportIdentity,
  synthPreview,
} from './cli-runtime.js';
import { parseCommandArgs } from './command-args.js';
import { writeJsonFile } from './io.js';
import { buildPlan } from './manifest.js';
import { planPath } from './paths.js';
import { resolvePreviewConfig } from './preview-stage.js';

function main(): void {
  const args = parseCommandArgs(process.argv.slice(2));
  const config = resolvePreviewConfig(args);

  const identity = resolveAndReportIdentity(config);

  synthPreview(config);

  const stacks = listPreviewStacks(config);
  if (stacks.length === 0) {
    throw new Error(
      `No preview stacks resolved for stage "${config.stage}" (profile "${config.profile}"). ` +
        'Ensure the CDK preview context (environmentType=preview) is wired and synthesizes stacks.',
    );
  }

  const plan = buildPlan(config, identity, stacks);
  const outPath = planPath(config.stage);
  writeJsonFile(outPath, plan);

  console.log(`\nWrote preview plan: ${outPath}`);
  console.log(`Preview stacks (${stacks.length}):`);
  for (const name of stacks) {
    console.log(`  ${name}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`preview:plan failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
