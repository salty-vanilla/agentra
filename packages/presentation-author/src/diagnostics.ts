import type { CreateContactSheetResult } from './contact-sheet.js';
import { createContactSheet } from './contact-sheet.js';
import type { ContentTypesIntegrityResult } from './pptx-repair.js';
import { checkContentTypesIntegrity } from './pptx-repair.js';
import type { RenderPresentationResult } from './render.js';
import { renderPresentation } from './render.js';
import type {
  DetectPresentationFontsResult,
  ValidatePresentationOverflowResult,
} from './validation.js';
import { detectPresentationFonts, validatePresentationOverflow } from './validation.js';

export interface PresentationDiagnosticsInput {
  pptxPath: string;
  workDir?: string | undefined;
  scriptsDir?: string | undefined;
  renderDir?: string | undefined;
  artifactsDir?: string | undefined;
  render?: boolean | undefined;
  contactSheet?: boolean | undefined;
  overflow?: boolean | undefined;
  fonts?: boolean | undefined;
  openXml?: boolean | undefined;
  timeoutMs?: number | undefined;
}

export interface PresentationDiagnosticsResult {
  status: 'pass' | 'warn' | 'fail';
  render?: RenderPresentationResult | undefined;
  contactSheet?: CreateContactSheetResult | undefined;
  overflow?: ValidatePresentationOverflowResult | undefined;
  fonts?: DetectPresentationFontsResult | undefined;
  openXml?: ContentTypesIntegrityResult | undefined;
  warnings: string[];
}

export async function runPresentationDiagnostics(
  input: PresentationDiagnosticsInput,
): Promise<PresentationDiagnosticsResult> {
  const doRender = input.render ?? true;
  const doContactSheet = input.contactSheet ?? true;
  const doOverflow = input.overflow ?? true;
  const doFonts = input.fonts ?? false;
  const doOpenXml = input.openXml ?? true;
  const warnings: string[] = [];

  let renderResult: RenderPresentationResult | undefined;
  let contactSheetResult: CreateContactSheetResult | undefined;
  let overflowResult: ValidatePresentationOverflowResult | undefined;
  let fontsResult: DetectPresentationFontsResult | undefined;
  let openXmlResult: ContentTypesIntegrityResult | undefined;

  if (doOpenXml) {
    try {
      openXmlResult = await checkContentTypesIntegrity(input.pptxPath);
      warnings.push(...openXmlResult.warnings);
      if (!openXmlResult.valid) {
        warnings.push(
          `OpenXML integrity: ${openXmlResult.missingParts.length} Override(s) in [Content_Types].xml reference missing parts: ${openXmlResult.missingParts.join(', ')}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`OpenXML integrity check failed: ${message}`);
    }
  }

  if (doRender) {
    renderResult = await renderPresentation({
      pptxPath: input.pptxPath,
      outputDir: input.renderDir,
      scriptsDir: input.scriptsDir,
      timeoutMs: input.timeoutMs,
    });
    warnings.push(...renderResult.warnings);
  }

  if (doContactSheet && renderResult?.success) {
    contactSheetResult = await createContactSheet({
      inputDir: renderResult.renderDir,
      outputFile: input.artifactsDir
        ? `${input.artifactsDir}/contact_sheet.png`
        : undefined,
      scriptsDir: input.scriptsDir,
      timeoutMs: input.timeoutMs,
    });
    warnings.push(...contactSheetResult.warnings);
  }

  if (doOverflow) {
    overflowResult = await validatePresentationOverflow({
      pptxPath: input.pptxPath,
      scriptsDir: input.scriptsDir,
      timeoutMs: input.timeoutMs,
    });
    warnings.push(...overflowResult.warnings);
  }

  if (doFonts) {
    fontsResult = await detectPresentationFonts({
      pptxPath: input.pptxPath,
      scriptsDir: input.scriptsDir,
      timeoutMs: input.timeoutMs,
    });
    warnings.push(...fontsResult.warnings);
  }

  const status = resolveStatus({
    renderResult,
    contactSheetResult,
    overflowResult,
    fontsResult,
    openXmlResult,
    doContactSheet,
    warnings,
  });

  return {
    status,
    render: renderResult,
    contactSheet: contactSheetResult,
    overflow: overflowResult,
    fonts: fontsResult,
    openXml: openXmlResult,
    warnings,
  };
}

function resolveStatus(ctx: {
  renderResult?: RenderPresentationResult | undefined;
  contactSheetResult?: CreateContactSheetResult | undefined;
  overflowResult?: ValidatePresentationOverflowResult | undefined;
  fontsResult?: DetectPresentationFontsResult | undefined;
  openXmlResult?: ContentTypesIntegrityResult | undefined;
  doContactSheet: boolean;
  warnings: string[];
}): 'pass' | 'warn' | 'fail' {
  // Fail conditions
  if (ctx.renderResult && !ctx.renderResult.success) return 'fail';
  if (ctx.renderResult && ctx.renderResult.slideCount === 0) return 'fail';
  if (ctx.doContactSheet && ctx.contactSheetResult && !ctx.contactSheetResult.success)
    return 'fail';

  // Warn conditions
  if (ctx.overflowResult && !ctx.overflowResult.passed) return 'warn';
  if (ctx.fontsResult && !ctx.fontsResult.success) return 'warn';
  if (ctx.openXmlResult && !ctx.openXmlResult.valid) return 'warn';
  if (ctx.warnings.length > 0) return 'warn';

  return 'pass';
}
