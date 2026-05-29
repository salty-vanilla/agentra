/**
 * `pnpm preview:deploy --stage <preview-stage> --profile <profile>`
 *
 * Runs all of `preview:plan`'s validation, then deploys ONLY the explicit
 * preview stack names (never `--all`), writes CDK outputs to
 * `.agentra/preview/<stage>/cdk-outputs.json`, and writes/updates
 * `manifest.json`.
 *
 * AI safety: this is the single allowed path for AI-assisted preview deploys.
 * Direct `cdk deploy --all` and direct AWS mutation commands are not allowed.
 */

import { buildCdkDeployArgs } from './cdk-commands.js';
import { listPreviewStacks, resolveAndReportIdentity, runCdk } from './cli-runtime.js';
import { parseCommandArgs } from './command-args.js';
import { readJsonFile, writeJsonFile } from './io.js';
import { buildManifest, type CdkOutputs, normalizeOutputs } from './manifest.js';
import { cdkOutputsPath, manifestPath } from './paths.js';
import { resolvePreviewConfig } from './preview-stage.js';

function main(): void {
  const args = parseCommandArgs(process.argv.slice(2));
  const config = resolvePreviewConfig(args);

  const identity = resolveAndReportIdentity(config);

  const stacks = listPreviewStacks(config);
  if (stacks.length === 0) {
    throw new Error(
      `No preview stacks resolved for stage "${config.stage}" (profile "${config.profile}"). ` +
        'Refusing to deploy without explicit preview stack names.',
    );
  }

  const outputsFile = cdkOutputsPath(config.stage);
  const deployArgs = buildCdkDeployArgs(config, stacks, outputsFile);

  console.log(`\nDeploying ${stacks.length} preview stack(s):`);
  for (const name of stacks) {
    console.log(`  ${name}`);
  }

  const status = runCdk(deployArgs);
  if (status !== 0) {
    throw new Error(`cdk deploy failed (exit ${status}).`);
  }

  const cdkOutputs = readJsonFile<CdkOutputs>(outputsFile);
  const outputs = normalizeOutputs(cdkOutputs);
  const manifest = buildManifest(config, identity, stacks, outputs);
  const manifestFile = manifestPath(config.stage);
  writeJsonFile(manifestFile, manifest);

  console.log(`\nWrote CDK outputs: ${outputsFile}`);
  console.log(`Wrote manifest: ${manifestFile}`);
}

try {
  main();
} catch (error) {
  console.error(`preview:deploy failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
