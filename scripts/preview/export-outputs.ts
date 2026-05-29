/**
 * `pnpm preview:outputs --stage <preview-stage>`
 *
 * Reads `.agentra/preview/<stage>/cdk-outputs.json`, normalizes recognized
 * outputs, refreshes the `outputs` field of the existing `manifest.json`, and
 * writes `env.backend` / `env.frontend` for downstream smoke tests.
 *
 * This command does NOT call AWS or CDK — it is purely file-in / file-out.
 * Missing outputs are simply omitted; no values are invented.
 */
import { existsSync } from 'node:fs';
import { parseCommandArgs } from './command-args.js';
import { readJsonFile, writeJsonFile, writeTextFile } from './io.js';
import {
  buildBackendEnv,
  buildFrontendEnv,
  type CdkOutputs,
  normalizeOutputs,
  type PreviewManifest,
} from './manifest.js';
import {
  cdkOutputsPath,
  envBackendPath,
  envFrontendPath,
  manifestPath,
} from './paths.js';
import { validatePreviewStage } from './preview-stage.js';

function main(): void {
  const args = parseCommandArgs(process.argv.slice(2));
  validatePreviewStage(args.stage);
  const { stage } = args;

  const outputsFile = cdkOutputsPath(stage);
  if (!existsSync(outputsFile)) {
    throw new Error(
      `No CDK outputs at ${outputsFile}. Run "pnpm preview:deploy --stage ${stage} ..." first.`,
    );
  }
  const manifestFile = manifestPath(stage);
  if (!existsSync(manifestFile)) {
    throw new Error(
      `No manifest at ${manifestFile}. Run "pnpm preview:deploy --stage ${stage} ..." first.`,
    );
  }

  const cdkOutputs = readJsonFile<CdkOutputs>(outputsFile);
  const outputs = normalizeOutputs(cdkOutputs);

  const existing = readJsonFile<PreviewManifest>(manifestFile);
  const manifest: PreviewManifest = { ...existing, outputs };
  writeJsonFile(manifestFile, manifest);

  writeTextFile(envBackendPath(stage), buildBackendEnv(outputs));
  writeTextFile(envFrontendPath(stage), buildFrontendEnv(outputs));

  console.log(`Refreshed manifest outputs: ${manifestFile}`);
  console.log(`Wrote env files: ${envBackendPath(stage)}, ${envFrontendPath(stage)}`);
  const keys = Object.keys(outputs);
  console.log(
    keys.length > 0
      ? `Recognized outputs: ${keys.join(', ')}`
      : 'No recognized outputs present in cdk-outputs.json.',
  );
}

try {
  main();
} catch (error) {
  console.error(`preview:outputs failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
