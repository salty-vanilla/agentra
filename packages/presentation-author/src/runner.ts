import { access } from 'node:fs/promises';
import {
  extractJavaScriptFromLlmOutput,
  validateAuthoringScript,
  writeAuthoringScript,
} from './authoring-script.js';
import type { BrandFrame } from './brand-frame/types.js';
import { copyBrandFrameToWorkspace } from './brand-frame/workspace.js';
import type { PresentationDiagnosticsInput } from './diagnostics.js';
import { runPresentationDiagnostics } from './diagnostics.js';
import { executeAuthoringScript } from './executor.js';
import { createDefaultLocalIconProvider } from './icons/icon-provider.js';
import type { IconManifest, IconProvider, IconResultMetadata } from './icons/types.js';
import { copyIconsToWorkspace } from './icons/workspace.js';
import { buildAuthoringPrompt } from './prompts.js';
import { runSingleRevisionAttempt } from './revision.js';
import type {
  DiagnosticsOptions,
  PresentationAuthorDeps,
  PresentationAuthorInput,
  PresentationAuthorResult,
  RevisionOptions,
} from './types.js';
import { createPresentationWorkspace } from './workspace.js';

function isRevisionEnabled(revision: PresentationAuthorInput['revision']): boolean {
  if (revision === true) return true;
  if (typeof revision === 'object' && revision.enabled !== false) return true;
  return false;
}

async function invokeDiagnostics(
  input: PresentationDiagnosticsInput,
  deps: PresentationAuthorDeps,
) {
  return deps.runDiagnostics
    ? deps.runDiagnostics(input)
    : runPresentationDiagnostics(input);
}

export async function runPresentationAuthor(
  input: PresentationAuthorInput,
  deps: PresentationAuthorDeps,
): Promise<PresentationAuthorResult> {
  const runId = deps.randomId?.() ?? undefined;
  const workspace = await createPresentationWorkspace({
    outputDir: input.outputDir,
    runId,
  });

  // --- BrandFrame setup ---
  const brandFrameWarnings: string[] = [];
  let brandFrame: BrandFrame | undefined;
  if (input.brandFrameId !== undefined) {
    const brandFrameResult = await copyBrandFrameToWorkspace({
      brandFrameId: input.brandFrameId,
      workDir: workspace.workDir,
    });
    brandFrame = brandFrameResult.brandFrame;
    brandFrameWarnings.push(...brandFrameResult.warnings);
  }

  // --- Icon setup ---
  const iconsEnabled = input.icons?.enabled !== false;
  let iconManifest: IconManifest | undefined;
  let iconMeta: IconResultMetadata | undefined;
  const iconProvider: IconProvider =
    deps.iconProvider ?? createDefaultLocalIconProvider(input.icons?.providerId);

  if (iconsEnabled) {
    const iconResult = await copyIconsToWorkspace({
      workDir: workspace.workDir,
      iconIds: input.icons?.preferredIconIds,
      provider: iconProvider,
    });
    iconManifest = {
      provider: 'lucide',
      version: 'local-curated-v1',
      style: 'line',
      icons: iconResult.copiedIcons.map((icon) => ({
        id: icon.id,
        label: icon.label,
        path: icon.workspacePath ?? icon.path,
        keywords: [],
      })),
    };
    iconMeta = {
      enabled: true,
      providerId: input.icons?.providerId ?? 'lucide-local',
      copiedIconIds: iconResult.copiedIcons.map((i) => i.id),
      warnings: iconResult.warnings.length > 0 ? iconResult.warnings : undefined,
    };
    brandFrameWarnings.push(...iconResult.warnings);
  } else {
    iconMeta = { enabled: false };
  }

  const authoringPrompt = buildAuthoringPrompt(input, { brandFrame, iconManifest });

  const llmResponse = await deps.llm.generateText({
    prompt: authoringPrompt,
  });

  const { code, warnings: extractWarnings } = extractJavaScriptFromLlmOutput(llmResponse);
  const { valid, warnings: valWarnings, errors } = validateAuthoringScript(code);
  const warnings = [...brandFrameWarnings, ...extractWarnings, ...valWarnings];

  if (!valid) {
    throw new Error(`Authoring script validation failed:\n${errors.join('\n')}`);
  }

  await writeAuthoringScript({
    sourceJsPath: workspace.sourceJsPath,
    code,
  });

  let execution = await executeAuthoringScript({
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
  const revisionEnabled = isRevisionEnabled(input.revision);

  // If revision is enabled, ensure diagnostics run by default
  const shouldRunDiagnostics = input.diagnostics || revisionEnabled;

  if (shouldRunDiagnostics) {
    const diagOpts: DiagnosticsOptions =
      typeof input.diagnostics === 'object' ? input.diagnostics : {};
    diagnosticsResult = await invokeDiagnostics(
      {
        pptxPath: workspace.pptxPath,
        workDir: workspace.workDir,
        scriptsDir: workspace.scriptsDir,
        render: diagOpts.render,
        contactSheet: diagOpts.contactSheet,
        overflow: diagOpts.overflow,
        fonts: diagOpts.fonts,
      },
      deps,
    );
    warnings.push(...diagnosticsResult.warnings);
  }

  // Revision attempt
  let revisionResult: PresentationAuthorResult['revision'];
  if (revisionEnabled) {
    if (!diagnosticsResult) {
      revisionResult = {
        attempted: false,
        succeeded: false,
        reason: 'diagnostics-not-run',
        warnings: [],
      };
    } else {
      revisionResult = await runSingleRevisionAttempt({
        workDir: workspace.workDir,
        originalUserPrompt: input.prompt,
        language: input.language,
        initialSourceJsPath: workspace.sourceJsPath,
        initialPptxPath: workspace.pptxPath,
        initialDiagnostics: diagnosticsResult,
        deps,
        timeoutMs: input.timeoutMs,
        diagnosticsOptions: input.diagnostics,
        brandFrame,
      });
      warnings.push(...revisionResult.warnings);

      // If revision succeeded, update top-level diagnostics/execution
      if (revisionResult.succeeded && revisionResult.execution) {
        execution = revisionResult.execution;
        if (revisionResult.diagnostics) {
          diagnosticsResult = revisionResult.diagnostics;
        }
      }
    }
  }

  return {
    workDir: workspace.workDir,
    sourceJsPath: workspace.sourceJsPath,
    pptxPath: workspace.pptxPath,
    warnings,
    execution,
    diagnostics: diagnosticsResult,
    revision: revisionResult,
    brandFrameId: brandFrame?.id,
    brandFrameName: brandFrame?.name,
    icons: iconMeta,
  };
}
