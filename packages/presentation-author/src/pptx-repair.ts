import { readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

export interface PptxRepairResult {
  applied: boolean;
  removedOverrides: string[];
  removedFiles: string[];
  rewrittenFiles: string[];
  warnings: string[];
}

const NOTES_PATH_PREFIXES = ['ppt/notesMasters/', 'ppt/notesSlides/'] as const;
const EMPTY_DIR_CANDIDATES = ['ppt/charts/', 'ppt/embeddings/'] as const;
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const PRESENTATION_PATH = 'ppt/presentation.xml';
const PRESENTATION_RELS_PATH = 'ppt/_rels/presentation.xml.rels';
const SLIDE_RELS_PATTERN = /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/;

/**
 * Post-process a pptx file written by pptxgenjs so PowerPoint does not show
 * the "repair" dialog on open. Targets defects that are known to ship in
 * pptxgenjs 3.x and 4.x and to remain unfixed upstream — see issue #134.
 */
export async function repairPptx(pptxPath: string): Promise<PptxRepairResult> {
  const buffer = await readFile(pptxPath);
  const zip = await JSZip.loadAsync(buffer);

  const warnings: string[] = [];
  const removedFiles: string[] = [];
  const rewrittenFiles: string[] = [];

  stripNotesInfrastructure(zip, removedFiles);
  stripEmptyDirs(zip, removedFiles);

  await rewriteIfChanged(zip, PRESENTATION_PATH, stripNotesMasterIdLst, rewrittenFiles);
  await rewriteIfChanged(
    zip,
    PRESENTATION_RELS_PATH,
    stripNotesMasterRelationship,
    rewrittenFiles,
  );

  for (const path of Object.keys(zip.files)) {
    if (SLIDE_RELS_PATTERN.test(path)) {
      await rewriteIfChanged(zip, path, stripNotesSlideRelationship, rewrittenFiles);
    }
  }

  const removedOverrides = await rewriteContentTypes(zip, warnings);
  if (removedOverrides.length > 0) {
    rewrittenFiles.push(CONTENT_TYPES_PATH);
  }

  const applied =
    removedFiles.length > 0 || rewrittenFiles.length > 0 || removedOverrides.length > 0;

  if (applied) {
    const out = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    await writeFile(pptxPath, out);
  }

  return { applied, removedOverrides, removedFiles, rewrittenFiles, warnings };
}

function stripNotesInfrastructure(zip: JSZip, removedFiles: string[]): void {
  const targets = Object.keys(zip.files).filter((path) =>
    NOTES_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
  for (const path of targets) {
    zip.remove(path);
    removedFiles.push(path);
  }
}

function stripEmptyDirs(zip: JSZip, removedFiles: string[]): void {
  for (const dir of EMPTY_DIR_CANDIDATES) {
    const hasChildren = Object.keys(zip.files).some(
      (path) => path.startsWith(dir) && path !== dir,
    );
    if (hasChildren) continue;
    if (zip.files[dir]) {
      zip.remove(dir);
      removedFiles.push(dir);
    }
  }
}

async function rewriteIfChanged(
  zip: JSZip,
  path: string,
  transform: (xml: string) => string,
  rewrittenFiles: string[],
): Promise<void> {
  const file = zip.file(path);
  if (!file) return;
  const original = await file.async('string');
  const updated = transform(original);
  if (updated !== original) {
    zip.file(path, updated);
    rewrittenFiles.push(path);
  }
}

function stripNotesMasterIdLst(xml: string): string {
  return xml
    .replace(/<p:notesMasterIdLst[^>]*\/>/g, '')
    .replace(/<p:notesMasterIdLst[^>]*>[\s\S]*?<\/p:notesMasterIdLst>/g, '');
}

function stripNotesMasterRelationship(xml: string): string {
  return xml.replace(/<Relationship\b[^>]*Type="[^"]*\/notesMaster"[^>]*\/>/g, '');
}

function stripNotesSlideRelationship(xml: string): string {
  return xml.replace(/<Relationship\b[^>]*Type="[^"]*\/notesSlide"[^>]*\/>/g, '');
}

async function rewriteContentTypes(zip: JSZip, warnings: string[]): Promise<string[]> {
  const file = zip.file(CONTENT_TYPES_PATH);
  if (!file) {
    warnings.push(`${CONTENT_TYPES_PATH} missing from pptx`);
    return [];
  }
  const original = await file.async('string');
  const removed: string[] = [];
  const updated = original.replace(
    /<Override\b[^>]*PartName="([^"]+)"[^>]*\/>/g,
    (match, partName: string) => {
      const key = partName.startsWith('/') ? partName.slice(1) : partName;
      if (zip.file(key)) return match;
      removed.push(partName);
      return '';
    },
  );
  if (updated !== original) {
    zip.file(CONTENT_TYPES_PATH, updated);
  }
  return removed;
}

export interface ContentTypesIntegrityResult {
  valid: boolean;
  missingParts: string[];
  warnings: string[];
}

/**
 * Verify that every <Override> in [Content_Types].xml points to a part that
 * actually exists in the pptx archive. Useful as a regression guard for
 * post-process repair, since orphan Overrides are what trigger PowerPoint's
 * "repair" dialog (upstream pptxgenjs issue #1444 and related defects).
 */
export async function checkContentTypesIntegrity(
  pptxPath: string,
): Promise<ContentTypesIntegrityResult> {
  const warnings: string[] = [];
  const buffer = await readFile(pptxPath);
  const zip = await JSZip.loadAsync(buffer);

  const file = zip.file(CONTENT_TYPES_PATH);
  if (!file) {
    warnings.push(`${CONTENT_TYPES_PATH} missing from pptx`);
    return { valid: false, missingParts: [], warnings };
  }
  const xml = await file.async('string');
  const missingParts: string[] = [];
  const overrideRe = /<Override\b[^>]*PartName="([^"]+)"[^>]*\/>/g;
  let m: RegExpExecArray | null = overrideRe.exec(xml);
  while (m !== null) {
    const partName = m[1];
    if (partName !== undefined) {
      const key = partName.startsWith('/') ? partName.slice(1) : partName;
      if (!zip.file(key)) {
        missingParts.push(partName);
      }
    }
    m = overrideRe.exec(xml);
  }
  return { valid: missingParts.length === 0, missingParts, warnings };
}
