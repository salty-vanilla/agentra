import {
  collectPresentationArtifacts,
  extractContactSheetPath,
  extractRenderedSlidePaths,
} from './artifacts.js';
import { runPresentationAuthor } from './runner.js';
import type {
  CreatePresentationToolInput,
  CreatePresentationToolOutput,
} from './tool-types.js';
import type { PresentationAuthorDeps } from './types.js';

export type CreatePresentationToolDeps = PresentationAuthorDeps;

const MAX_PROMPT_LENGTH = 40_000;

// --- Language inference ---

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

function inferLanguage(prompt: string): 'ja' | 'en' {
  return JAPANESE_RE.test(prompt) ? 'ja' : 'en';
}

// --- Input validation ---

interface ValidationResult {
  valid: boolean;
  error?: CreatePresentationToolOutput['error'];
}

function validateInput(input: CreatePresentationToolInput): ValidationResult {
  if (!input.prompt || input.prompt.trim().length === 0) {
    return {
      valid: false,
      error: {
        message: 'prompt is required and must not be empty.',
        phase: 'input-validation',
      },
    };
  }
  if (input.prompt.length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      error: {
        message: `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.`,
        phase: 'input-validation',
      },
    };
  }
  return { valid: true };
}

// --- Error mapping ---

export function mapErrorToToolError(
  error: unknown,
): NonNullable<CreatePresentationToolOutput['error']> {
  const message = error instanceof Error ? error.message : String(error);
  const truncated = message.slice(0, 500);

  if (/validation|dangerous/i.test(message)) {
    return { message: truncated, phase: 'script-validation' };
  }
  if (/execution|stderr|exit\s+\d/i.test(message)) {
    return { message: truncated, phase: 'script-execution' };
  }
  if (/llm|generatetext/i.test(message)) {
    return { message: truncated, phase: 'llm-generation' };
  }
  return { message: truncated, phase: 'unknown' };
}

// --- Summary builder ---

export function buildCreatePresentationSummary(input: {
  success: boolean;
  prompt: string;
  pptxPath?: string | undefined;
  diagnosticsStatus?: 'pass' | 'warn' | 'fail' | undefined;
  revisionAttempted?: boolean | undefined;
  revisionSucceeded?: boolean | undefined;
  revisionReason?: string | undefined;
  warnings?: string[] | undefined;
  errorPhase?: string | undefined;
}): string {
  if (!input.success) {
    const phase = input.errorPhase ? ` during ${input.errorPhase}` : '';
    return `Presentation creation failed${phase}. No PPTX artifact was produced.`;
  }

  const parts: string[] = ['Presentation created successfully.'];

  if (input.diagnosticsStatus) {
    parts.push(`Diagnostics: ${input.diagnosticsStatus}.`);
  }

  if (input.revisionAttempted) {
    if (input.revisionSucceeded) {
      parts.push('One revision attempt succeeded.');
    } else {
      parts.push(`Revision attempted but failed (${input.revisionReason ?? 'unknown'}).`);
    }
  } else if (input.revisionReason === 'diagnostics-pass') {
    parts.push('Revision skipped because diagnostics passed.');
  } else if (input.revisionReason === 'disabled') {
    parts.push('Revision disabled.');
  }

  const warnCount = input.warnings?.length ?? 0;
  if (warnCount > 0) {
    parts.push(`${warnCount} warning(s).`);
  }

  return parts.join(' ');
}

// --- Main tool function ---

export async function createPresentation(
  input: CreatePresentationToolInput,
  deps: CreatePresentationToolDeps,
): Promise<CreatePresentationToolOutput> {
  const validation = validateInput(input);
  if (!validation.valid) {
    return {
      success: false,
      summary: buildCreatePresentationSummary({
        success: false,
        prompt: input.prompt ?? '',
        errorPhase: 'input-validation',
      }),
      workDir: '',
      artifacts: [],
      warnings: [],
      error: validation.error,
    };
  }

  const language = input.language ?? inferLanguage(input.prompt);

  try {
    const result = await runPresentationAuthor(
      {
        prompt: input.prompt,
        language,
        styleGuide: input.styleGuide,
        templatePath: input.templatePath,
        outputDir: input.outputDir,
        timeoutMs: input.timeoutMs,
        diagnostics: input.diagnostics ?? true,
        revision: input.revision ?? true,
        brandFrameId: input.brandFrameId,
        icons: input.icons,
        images: input.images,
      },
      deps,
    );

    const contactSheetPath = extractContactSheetPath(result.diagnostics);
    const renderedSlidePaths = extractRenderedSlidePaths(result.diagnostics);
    const artifacts = await collectPresentationArtifacts({
      workDir: result.workDir,
      pptxPath: result.pptxPath,
      sourceJsPath: result.sourceJsPath,
      diagnostics: result.diagnostics,
      imageAssetPaths: result.imageAssetPaths,
    });

    const summary = buildCreatePresentationSummary({
      success: true,
      prompt: input.prompt,
      pptxPath: result.pptxPath,
      diagnosticsStatus: result.diagnostics?.status,
      revisionAttempted: result.revision?.attempted,
      revisionSucceeded: result.revision?.succeeded,
      revisionReason: result.revision?.reason,
      warnings: result.warnings,
    });

    return {
      success: true,
      summary,
      workDir: result.workDir,
      pptxPath: result.pptxPath,
      sourceJsPath: result.sourceJsPath,
      contactSheetPath,
      renderedSlidePaths: renderedSlidePaths.length > 0 ? renderedSlidePaths : undefined,
      diagnosticsStatus: result.diagnostics?.status,
      revisionAttempted: result.revision?.attempted,
      revisionSucceeded: result.revision?.succeeded,
      revisionReason: result.revision?.reason,
      artifacts,
      warnings: result.warnings,
      brandFrameId: result.brandFrameId,
      brandFrameName: result.brandFrameName,
      icons: result.icons,
      images: result.images,
    };
  } catch (err) {
    const toolError = mapErrorToToolError(err);

    return {
      success: false,
      summary: buildCreatePresentationSummary({
        success: false,
        prompt: input.prompt,
        errorPhase: toolError.phase,
      }),
      workDir: '',
      artifacts: [],
      warnings: [],
      error: toolError,
    };
  }
}
