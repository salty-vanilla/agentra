import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  extractJavaScriptFromLlmOutput,
  validateAuthoringScript,
} from './authoring-script.js';
import type { BrandFrame } from './brand-frame/types.js';
import type {
  PresentationDiagnosticsInput,
  PresentationDiagnosticsResult,
} from './diagnostics.js';
import { runPresentationDiagnostics } from './diagnostics.js';
import { executeAuthoringScript } from './executor.js';
import { buildSingleRevisionPrompt } from './revision-prompts.js';
import type {
  DiagnosticsOptions,
  PresentationAuthorDeps,
  PresentationLanguage,
  RevisionAttemptResult,
} from './types.js';

const WORKSPACE_PACKAGE_JSON = JSON.stringify(
  { type: 'commonjs', dependencies: { pptxgenjs: '*' } },
  null,
  2,
);

// --- reviseAuthoringScript ---

export interface ReviseAuthoringScriptInput {
  originalUserPrompt: string;
  language?: PresentationLanguage | undefined;
  previousCode: string;
  diagnostics?: PresentationDiagnosticsResult | undefined;
  deps: PresentationAuthorDeps;
  brandFrame?: BrandFrame | undefined;
}

export interface ReviseAuthoringScriptResult {
  code: string;
  rawText: string;
  warnings: string[];
}

export async function reviseAuthoringScript(
  input: ReviseAuthoringScriptInput,
): Promise<ReviseAuthoringScriptResult> {
  const prompt = buildSingleRevisionPrompt({
    originalUserPrompt: input.originalUserPrompt,
    language: input.language,
    previousCode: input.previousCode,
    diagnostics: input.diagnostics,
    brandFrame: input.brandFrame,
  });

  const rawText = await input.deps.llm.converse({ prompt });

  const { code, warnings: extractWarnings } = extractJavaScriptFromLlmOutput(rawText);
  const { valid, warnings: valWarnings, errors } = validateAuthoringScript(code);
  const warnings = [...extractWarnings, ...valWarnings];

  if (!valid) {
    throw new Error(`Revision script validation failed:\n${errors.join('\n')}`);
  }

  return { code, rawText, warnings };
}

// --- runSingleRevisionAttempt ---

export interface RunSingleRevisionAttemptInput {
  workDir: string;
  originalUserPrompt: string;
  language?: PresentationLanguage | undefined;
  initialSourceJsPath: string;
  initialPptxPath: string;
  initialDiagnostics?: PresentationDiagnosticsResult | undefined;
  deps: PresentationAuthorDeps;
  timeoutMs?: number | undefined;
  diagnosticsOptions?: boolean | DiagnosticsOptions | undefined;
  brandFrame?: BrandFrame | undefined;
}

export async function runSingleRevisionAttempt(
  input: RunSingleRevisionAttemptInput,
): Promise<RevisionAttemptResult> {
  const warnings: string[] = [];

  // Gate: no diagnostics available
  if (!input.initialDiagnostics) {
    return {
      attempted: false,
      succeeded: false,
      reason: 'diagnostics-not-run',
      warnings,
    };
  }

  // Gate: diagnostics passed
  if (input.initialDiagnostics.status === 'pass') {
    return {
      attempted: false,
      succeeded: false,
      reason: 'diagnostics-pass',
      warnings,
    };
  }

  // Read previous code
  const previousCode = await readFile(input.initialSourceJsPath, 'utf-8');

  // Ask LLM for revised code
  let revisedCode: string;
  let reviseWarnings: string[];
  try {
    const result = await reviseAuthoringScript({
      originalUserPrompt: input.originalUserPrompt,
      language: input.language,
      previousCode,
      diagnostics: input.initialDiagnostics,
      deps: input.deps,
      brandFrame: input.brandFrame,
    });
    revisedCode = result.code;
    reviseWarnings = result.warnings;
    warnings.push(...reviseWarnings);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('validation failed')) {
      warnings.push(`Revision validation failed: ${msg}`);
      return {
        attempted: true,
        succeeded: false,
        reason: 'revision-validation-failed',
        warnings,
      };
    }
    warnings.push(`Revision generation failed: ${msg}`);
    return {
      attempted: true,
      succeeded: false,
      reason: 'revision-generation-failed',
      warnings,
    };
  }

  // Set up revision workspace
  const revDir = join(input.workDir, 'revision');
  const revSourceJs = join(revDir, 'presentation.js');
  const revPptx = join(revDir, 'deck.pptx');
  const revHelpersDir = join(revDir, 'helpers', 'pptxgenjs_helpers');
  const revScriptsDir = join(revDir, 'scripts');
  const revRenderDir = join(revDir, 'rendered');
  const revArtifactsDir = join(revDir, 'artifacts');

  await mkdir(revDir, { recursive: true });
  await mkdir(revRenderDir, { recursive: true });
  await mkdir(revArtifactsDir, { recursive: true });
  await writeFile(join(revDir, 'package.json'), WORKSPACE_PACKAGE_JSON, 'utf-8');
  await writeFile(revSourceJs, revisedCode, 'utf-8');

  // Copy helpers and scripts from initial workspace
  const srcHelpers = join(input.workDir, 'helpers', 'pptxgenjs_helpers');
  const srcScripts = join(input.workDir, 'scripts');
  try {
    await cp(srcHelpers, revHelpersDir, { recursive: true });
  } catch {
    warnings.push('Failed to copy helpers into revision workspace');
  }
  try {
    await cp(srcScripts, revScriptsDir, { recursive: true });
  } catch {
    warnings.push('Failed to copy scripts into revision workspace');
  }

  // Copy brand frame assets and helper from initial workspace
  const srcBrandFrameAssets = join(input.workDir, 'assets', 'brand-frame');
  const srcBrandFrameHelper = join(input.workDir, 'helpers', 'brand-frame.js');
  const revBrandFrameAssets = join(revDir, 'assets', 'brand-frame');
  const revBrandFrameHelper = join(revDir, 'helpers', 'brand-frame.js');
  try {
    await cp(srcBrandFrameAssets, revBrandFrameAssets, { recursive: true });
  } catch {
    // Brand frame assets may not exist if not enabled
  }
  try {
    await cp(srcBrandFrameHelper, revBrandFrameHelper);
  } catch {
    // Brand frame helper may not exist if not enabled
  }

  // Execute revised script
  const execution = await executeAuthoringScript({
    workDir: revDir,
    sourceJsPath: revSourceJs,
    pptxPath: revPptx,
    timeoutMs: input.timeoutMs,
  });

  if (!execution.success) {
    warnings.push(
      `Revision execution failed (exit ${execution.exitCode}): ${execution.stderr.slice(0, 300)}`,
    );
    return {
      attempted: true,
      succeeded: false,
      reason: 'revision-execution-failed',
      execution,
      warnings,
    };
  }

  // Verify deck.pptx exists
  try {
    await access(revPptx);
  } catch {
    warnings.push('Revision script ran but did not produce deck.pptx');
    return {
      attempted: true,
      succeeded: false,
      reason: 'revision-output-missing',
      execution,
      warnings,
    };
  }

  // Run diagnostics on revised deck
  let revDiagnostics: PresentationDiagnosticsResult | undefined;
  if (input.diagnosticsOptions !== false) {
    const diagOpts: DiagnosticsOptions =
      typeof input.diagnosticsOptions === 'object' ? input.diagnosticsOptions : {};
    const diagInput: PresentationDiagnosticsInput = {
      pptxPath: revPptx,
      workDir: revDir,
      scriptsDir: revScriptsDir,
      renderDir: revRenderDir,
      artifactsDir: revArtifactsDir,
      render: diagOpts.render,
      contactSheet: diagOpts.contactSheet,
      overflow: diagOpts.overflow,
      fonts: diagOpts.fonts,
    };
    revDiagnostics = input.deps.runDiagnostics
      ? await input.deps.runDiagnostics(diagInput)
      : await runPresentationDiagnostics(diagInput);

    if (revDiagnostics.status === 'fail') {
      warnings.push('Revised deck diagnostics status is fail');
    }
  }

  // Copy revised files to root workspace
  await cp(revSourceJs, input.initialSourceJsPath, { force: true });
  await cp(revPptx, input.initialPptxPath, { force: true });

  return {
    attempted: true,
    succeeded: true,
    reason: 'revision-succeeded',
    sourceJsPath: input.initialSourceJsPath,
    pptxPath: input.initialPptxPath,
    execution,
    diagnostics: revDiagnostics,
    warnings,
  };
}
