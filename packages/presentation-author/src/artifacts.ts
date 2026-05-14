import { access } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ArtifactRef } from '@agentra/shared';
import { uuidv7 } from 'uuidv7';
import type { PresentationDiagnosticsResult } from './diagnostics.js';

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

const now = new Date().toISOString();

function createArtifact(
  kind: ArtifactRef['kind'],
  path: string,
  label: string,
  exists: boolean,
): ArtifactRef {
  return {
    id: uuidv7(),
    kind,
    name: basename(path),
    path,
    label,
    exists,
    createdAt: now,
  };
}

export async function collectPresentationArtifacts(input: {
  workDir: string;
  pptxPath?: string | undefined;
  sourceJsPath?: string | undefined;
  diagnostics?: PresentationDiagnosticsResult | undefined;
  imageAssetPaths?: string[] | undefined;
}): Promise<ArtifactRef[]> {
  const artifacts: ArtifactRef[] = [];

  // work-dir
  artifacts.push(
    createArtifact(
      'work-dir',
      input.workDir,
      'Working directory',
      await fileExists(input.workDir),
    ),
  );

  // pptx
  if (input.pptxPath) {
    artifacts.push(
      createArtifact(
        'pptx',
        input.pptxPath,
        'Generated PPTX',
        await fileExists(input.pptxPath),
      ),
    );
  }

  // source-js
  if (input.sourceJsPath) {
    artifacts.push(
      createArtifact(
        'source-js',
        input.sourceJsPath,
        'Authoring script',
        await fileExists(input.sourceJsPath),
      ),
    );
  }

  // contact-sheet
  const contactSheetPath = extractContactSheetPath(input.diagnostics);
  if (contactSheetPath) {
    artifacts.push(
      createArtifact(
        'contact-sheet',
        contactSheetPath,
        'Contact sheet',
        await fileExists(contactSheetPath),
      ),
    );
  }

  // render-dir + rendered-slide
  if (input.diagnostics?.render?.success && input.diagnostics.render.renderDir) {
    const renderDir = input.diagnostics.render.renderDir;
    artifacts.push(
      createArtifact(
        'render-dir',
        renderDir,
        'Rendered slides directory',
        await fileExists(renderDir),
      ),
    );

    const slidePaths = extractRenderedSlidePaths(input.diagnostics);
    for (const slidePath of slidePaths) {
      artifacts.push(
        createArtifact(
          'rendered-slide',
          slidePath,
          'Rendered slide',
          await fileExists(slidePath),
        ),
      );
    }
  }

  // image-asset (retrieved / generated images)
  if (input.imageAssetPaths) {
    for (const imgPath of input.imageAssetPaths) {
      artifacts.push(
        createArtifact('image-asset', imgPath, 'Image asset', await fileExists(imgPath)),
      );
    }
  }

  return artifacts;
}
