import { access } from 'node:fs/promises';
import type { PresentationDiagnosticsResult } from './diagnostics.js';
import type { CreatePresentationArtifact } from './tool-types.js';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function extractContactSheetPath(
  diagnostics?: PresentationDiagnosticsResult,
): string | undefined {
  if (!diagnostics?.contactSheet?.success) return undefined;
  return diagnostics.contactSheet.contactSheetPath;
}

export function extractRenderedSlidePaths(
  diagnostics?: PresentationDiagnosticsResult,
): string[] {
  if (!diagnostics?.render?.success) return [];
  return diagnostics.render.slideImagePaths;
}

export async function collectPresentationArtifacts(input: {
  workDir: string;
  pptxPath?: string | undefined;
  sourceJsPath?: string | undefined;
  diagnostics?: PresentationDiagnosticsResult | undefined;
  imageAssetPaths?: string[] | undefined;
}): Promise<CreatePresentationArtifact[]> {
  const artifacts: CreatePresentationArtifact[] = [];

  // work-dir
  artifacts.push({
    kind: 'work-dir',
    path: input.workDir,
    label: 'Working directory',
    exists: await fileExists(input.workDir),
  });

  // pptx
  if (input.pptxPath) {
    artifacts.push({
      kind: 'pptx',
      path: input.pptxPath,
      label: 'Generated PPTX',
      exists: await fileExists(input.pptxPath),
    });
  }

  // source-js
  if (input.sourceJsPath) {
    artifacts.push({
      kind: 'source-js',
      path: input.sourceJsPath,
      label: 'Authoring script',
      exists: await fileExists(input.sourceJsPath),
    });
  }

  // contact-sheet
  const contactSheetPath = extractContactSheetPath(input.diagnostics);
  if (contactSheetPath) {
    artifacts.push({
      kind: 'contact-sheet',
      path: contactSheetPath,
      label: 'Contact sheet',
      exists: await fileExists(contactSheetPath),
    });
  }

  // render-dir + rendered-slide
  if (input.diagnostics?.render?.success && input.diagnostics.render.renderDir) {
    const renderDir = input.diagnostics.render.renderDir;
    artifacts.push({
      kind: 'render-dir',
      path: renderDir,
      label: 'Rendered slides directory',
      exists: await fileExists(renderDir),
    });

    const slidePaths = extractRenderedSlidePaths(input.diagnostics);
    for (const slidePath of slidePaths) {
      artifacts.push({
        kind: 'rendered-slide',
        path: slidePath,
        label: `Rendered slide`,
        exists: await fileExists(slidePath),
      });
    }
  }

  // image-asset (retrieved / generated images)
  if (input.imageAssetPaths) {
    for (const imgPath of input.imageAssetPaths) {
      artifacts.push({
        kind: 'image-asset',
        path: imgPath,
        label: 'Image asset',
        exists: await fileExists(imgPath),
      });
    }
  }

  return artifacts;
}
