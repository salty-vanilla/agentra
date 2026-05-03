import { access } from 'node:fs/promises';
import {
  extractJavaScriptFromLlmOutput,
  validateAuthoringScript,
  writeAuthoringScript,
} from './authoring-script.js';
import { runPresentationDiagnostics } from './diagnostics.js';
import { executeAuthoringScript } from './executor.js';
import { buildAuthoringPrompt } from './prompts.js';
import type {
  DiagnosticsOptions,
  PresentationAuthorDeps,
  PresentationAuthorInput,
  PresentationAuthorResult,
} from './types.js';
import { createPresentationWorkspace } from './workspace.js';

export async function runPresentationAuthor(
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
): Promise<PresentationAuthorResult> {
  const runId = deps.randomId?.() ?? undefined;
  const workspace = await createPresentationWorkspace({
    outputDir: input.outputDir,
    runId,
  });

  const authoringPrompt = buildAuthoringPrompt(input);

  const llmResponse = await deps.llm.generateText({
    prompt: authoringPrompt,
  });

  const { code, warnings: extractWarnings } = extractJavaScriptFromLlmOutput(llmResponse);
  const { valid, warnings: valWarnings, errors } = validateAuthoringScript(code);
  const warnings = [...extractWarnings, ...valWarnings];

  if (!valid) {
    throw new Error(`Authoring script validation failed:\n${errors.join('\n')}`);
  }

  await writeAuthoringScript({
    sourceJsPath: workspace.sourceJsPath,
    code,
  });

  const execution = await executeAuthoringScript({
    workDir: workspace.workDir,
    sourceJsPath: workspace.sourceJsPath,
    pptxPath: workspace.pptxPath,
    timeoutMs: input.timeoutMs,
  });

  if (!execution.success) {
    const stderrSummary = execution.stderr.slice(0, 500);
    throw new Error(
      `Authoring script execution failed (exit ${execution.exitCode}):\n${stderrSummary}`,
    );
  }

  try {
    await access(workspace.pptxPath);
  } catch {
    throw new Error(
      `deck.pptx was not created after successful script execution. workDir: ${workspace.workDir}`,
    );
  }

  let diagnosticsResult: PresentationAuthorResult['diagnostics'];
  if (input.diagnostics) {
    const diagOpts: DiagnosticsOptions =
      typeof input.diagnostics === 'object' ? input.diagnostics : {};
    diagnosticsResult = await runPresentationDiagnostics({
      pptxPath: workspace.pptxPath,
      workDir: workspace.workDir,
      scriptsDir: workspace.scriptsDir,
      render: diagOpts.render,
      contactSheet: diagOpts.contactSheet,
      overflow: diagOpts.overflow,
      fonts: diagOpts.fonts,
    });
    warnings.push(...diagnosticsResult.warnings);
  }

  return {
    workDir: workspace.workDir,
    sourceJsPath: workspace.sourceJsPath,
    pptxPath: workspace.pptxPath,
    warnings,
    execution,
    diagnostics: diagnosticsResult,
  };
}
