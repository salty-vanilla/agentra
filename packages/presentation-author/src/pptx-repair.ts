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
const SLIDE_LIKE_XML_PATTERN =
  /^ppt\/(slides\/slide|slideMasters\/slideMaster|slideLayouts\/slideLayout)\d+\.xml$/;
const EMPTY_TX_BODY = '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>';
const EMPTY_EFFECT_LST = '<a:effectLst/>';

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
    if (SLIDE_LIKE_XML_PATTERN.test(path)) {
      await rewriteIfChanged(zip, path, fixSlideLikeXml, rewrittenFiles);
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
    const descendants = Object.keys(zip.files).filter(
      (path) => path.startsWith(dir) && path !== dir,
    );
    const hasFileDescendant = descendants.some((path) => !zip.files[path]?.dir);
    if (hasFileDescendant) continue;
    for (const path of descendants) {
      zip.remove(path);
      removedFiles.push(path);
    }
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

function fixSlideLikeXml(xml: string): string {
  return clampAlphaValues(addEffectLstToBgPr(addTxBodyToShapes(xml)));
}

/**
 * Clamp `<a:alpha val="N"/>` to OpenXML's ST_PositiveFixedPercentage range
 * [0, 100000]. pptxgenjs scripts that pass shadow opacity as a 0-100 integer
 * (e.g. `opacity: 25`) emit `val="2500000"` because pptxgenjs multiplies by
 * 100000 assuming a 0-1 decimal. PowerPoint flags any alpha > 100000 for
 * repair on open. We rescale obvious "100x too large" values back to the
 * intended percentage; anything else clamps to 100000.
 */
function clampAlphaValues(xml: string): string {
  return xml.replace(/<a:alpha\s+val="(-?\d+)"\s*\/>/g, (_match, raw: string) => {
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) return _match;
    if (value >= 0 && value <= 100000) return _match;
    const rescaled = value > 100000 && value % 100 === 0 ? value / 100 : value;
    const clamped = Math.max(0, Math.min(100000, rescaled));
    return `<a:alpha val="${clamped}"/>`;
  });
}

/**
 * Add a minimal empty <p:txBody> to any <p:sp> that lacks one. PowerPoint
 * shows the repair dialog when a shape has <p:spPr> but no <p:txBody>; this
 * happens whenever pptxgenjs emits addShape() without text. Upstream #1441.
 */
function addTxBodyToShapes(xml: string): string {
  return xml.replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g, (match) => {
    if (/<p:txBody\b/.test(match)) return match;
    return `${match.slice(0, -'</p:sp>'.length)}${EMPTY_TX_BODY}</p:sp>`;
  });
}

/**
 * Add an empty <a:effectLst/> to any <p:bgPr> that lacks one. PowerPoint's
 * repair logic adds this element when a slide background uses solid fill
 * without an effect list. Upstream #1442.
 */
function addEffectLstToBgPr(xml: string): string {
  return xml.replace(/<p:bgPr\b[^>]*>[\s\S]*?<\/p:bgPr>/g, (match) => {
    if (/<a:effectLst\b/.test(match)) return match;
    return `${match.slice(0, -'</p:bgPr>'.length)}${EMPTY_EFFECT_LST}</p:bgPr>`;
  });
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
