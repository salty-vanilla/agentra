import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { checkContentTypesIntegrity, repairPptx } from '../pptx-repair.js';

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`Expected zip entry ${path} to exist`);
  return file.async('string');
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  for (const dir of cleanupDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  cleanupDirs.length = 0;
});

interface FixtureOptions {
  slideCount: number;
  phantomSlideMasterOverrides?: boolean;
  includeNotes?: boolean;
  includeEmptyChartsDir?: boolean;
  includeEmptyEmbeddingsDir?: boolean;
}

async function buildFixturePptx(opts: FixtureOptions): Promise<Buffer> {
  const zip = new JSZip();
  const slides = Array.from({ length: opts.slideCount }, (_, i) => i + 1);

  // [Content_Types].xml
  const overrides: string[] = [];
  if (opts.phantomSlideMasterOverrides) {
    for (const idx of slides) {
      overrides.push(
        `<Override PartName="/ppt/slideMasters/slideMaster${idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
      );
    }
  } else {
    overrides.push(
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    );
  }
  for (const idx of slides) {
    overrides.push(
      `<Override PartName="/ppt/slides/slide${idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
  }
  overrides.push(
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
  );
  if (opts.includeNotes) {
    overrides.push(
      '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
    );
    for (const idx of slides) {
      overrides.push(
        `<Override PartName="/ppt/notesSlides/notesSlide${idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
      );
    }
  }
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`,
  );

  // presentation.xml
  const notesMasterIdLst = opts.includeNotes
    ? '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotes"/></p:notesMasterIdLst>'
    : '';
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldMasterIdLst><p:sldMasterId r:id="rId1"/></p:sldMasterIdLst>${notesMasterIdLst}<p:sldIdLst>${slides.map((idx) => `<p:sldId id="${256 + idx}" r:id="rIdSlide${idx}"/>`).join('')}</p:sldIdLst></p:presentation>`,
  );

  // presentation.xml.rels
  const presRels: string[] = [];
  presRels.push(
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
  );
  for (const idx of slides) {
    presRels.push(
      `<Relationship Id="rIdSlide${idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx}.xml"/>`,
    );
  }
  if (opts.includeNotes) {
    presRels.push(
      '<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>',
    );
  }
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`,
  );

  // Single real slideMaster1.xml (regardless of phantom Overrides)
  zip.file('ppt/slideMasters/slideMaster1.xml', '<sm/>');

  // Slides and per-slide rels
  for (const idx of slides) {
    zip.file(`ppt/slides/slide${idx}.xml`, '<s/>');
    const slideRels = opts.includeNotes
      ? `<Relationship Id="rIdNS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${idx}.xml"/>`
      : '';
    zip.file(
      `ppt/slides/_rels/slide${idx}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}</Relationships>`,
    );
  }

  if (opts.includeNotes) {
    zip.file('ppt/notesMasters/notesMaster1.xml', '<nm/>');
    for (const idx of slides) {
      zip.file(`ppt/notesSlides/notesSlide${idx}.xml`, '<ns/>');
    }
  }

  if (opts.includeEmptyChartsDir) {
    zip.folder('ppt/charts');
  }
  if (opts.includeEmptyEmbeddingsDir) {
    zip.folder('ppt/embeddings');
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function writeFixture(opts: FixtureOptions): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pptx-repair-'));
  cleanupDirs.push(dir);
  const path = join(dir, 'deck.pptx');
  await writeFile(path, await buildFixturePptx(opts));
  return path;
}

describe('repairPptx', () => {
  it('removes phantom slideMaster Overrides from [Content_Types].xml', async () => {
    const path = await writeFixture({
      slideCount: 8,
      phantomSlideMasterOverrides: true,
    });

    const result = await repairPptx(path);

    expect(result.applied).toBe(true);
    expect(result.removedOverrides).toEqual(
      expect.arrayContaining([
        '/ppt/slideMasters/slideMaster2.xml',
        '/ppt/slideMasters/slideMaster3.xml',
        '/ppt/slideMasters/slideMaster4.xml',
        '/ppt/slideMasters/slideMaster5.xml',
        '/ppt/slideMasters/slideMaster6.xml',
        '/ppt/slideMasters/slideMaster7.xml',
        '/ppt/slideMasters/slideMaster8.xml',
      ]),
    );
    expect(result.removedOverrides).not.toContain('/ppt/slideMasters/slideMaster1.xml');

    const zip = await JSZip.loadAsync(await readFile(path));
    const contentTypes = await readZipText(zip, '[Content_Types].xml');
    expect(contentTypes).toContain('slideMaster1.xml');
    expect(contentTypes).not.toContain('slideMaster2.xml');
    expect(contentTypes).not.toContain('slideMaster8.xml');
  });

  it('strips notesMasters, notesSlides, and related rels when present', async () => {
    const path = await writeFixture({
      slideCount: 3,
      includeNotes: true,
    });

    const result = await repairPptx(path);

    expect(result.applied).toBe(true);
    expect(result.removedFiles).toEqual(
      expect.arrayContaining([
        'ppt/notesMasters/notesMaster1.xml',
        'ppt/notesSlides/notesSlide1.xml',
        'ppt/notesSlides/notesSlide2.xml',
        'ppt/notesSlides/notesSlide3.xml',
      ]),
    );
    expect(result.removedOverrides).toEqual(
      expect.arrayContaining([
        '/ppt/notesMasters/notesMaster1.xml',
        '/ppt/notesSlides/notesSlide1.xml',
      ]),
    );

    const zip = await JSZip.loadAsync(await readFile(path));
    expect(zip.file('ppt/notesMasters/notesMaster1.xml')).toBeNull();
    expect(zip.file('ppt/notesSlides/notesSlide1.xml')).toBeNull();

    const presentationXml = await readZipText(zip, 'ppt/presentation.xml');
    expect(presentationXml).not.toContain('notesMasterIdLst');

    const presRels = await readZipText(zip, 'ppt/_rels/presentation.xml.rels');
    expect(presRels).not.toContain('/notesMaster');

    const slideRels = await readZipText(zip, 'ppt/slides/_rels/slide1.xml.rels');
    expect(slideRels).not.toContain('/notesSlide');
  });

  it('removes empty ppt/charts/ and ppt/embeddings/ directories', async () => {
    const path = await writeFixture({
      slideCount: 1,
      includeEmptyChartsDir: true,
      includeEmptyEmbeddingsDir: true,
    });

    const result = await repairPptx(path);

    expect(result.removedFiles).toEqual(
      expect.arrayContaining(['ppt/charts/', 'ppt/embeddings/']),
    );

    const zip = await JSZip.loadAsync(await readFile(path));
    expect(zip.files['ppt/charts/']).toBeUndefined();
    expect(zip.files['ppt/embeddings/']).toBeUndefined();
  });

  it('is a no-op for a clean pptx', async () => {
    const path = await writeFixture({ slideCount: 2 });

    const result = await repairPptx(path);

    expect(result.applied).toBe(false);
    expect(result.removedOverrides).toEqual([]);
    expect(result.removedFiles).toEqual([]);
    expect(result.rewrittenFiles).toEqual([]);
  });
});

describe('checkContentTypesIntegrity', () => {
  it('reports valid when every Override points to an existing part', async () => {
    const path = await writeFixture({ slideCount: 3 });

    const result = await checkContentTypesIntegrity(path);

    expect(result.valid).toBe(true);
    expect(result.missingParts).toEqual([]);
  });

  it('reports the missing parts when phantom Overrides are present', async () => {
    const path = await writeFixture({
      slideCount: 4,
      phantomSlideMasterOverrides: true,
    });

    const result = await checkContentTypesIntegrity(path);

    expect(result.valid).toBe(false);
    expect(result.missingParts).toEqual(
      expect.arrayContaining([
        '/ppt/slideMasters/slideMaster2.xml',
        '/ppt/slideMasters/slideMaster3.xml',
        '/ppt/slideMasters/slideMaster4.xml',
      ]),
    );
    expect(result.missingParts).not.toContain('/ppt/slideMasters/slideMaster1.xml');
  });

  it('passes after repairPptx has been applied', async () => {
    const path = await writeFixture({
      slideCount: 5,
      phantomSlideMasterOverrides: true,
      includeNotes: true,
    });

    await repairPptx(path);
    const result = await checkContentTypesIntegrity(path);

    expect(result.valid).toBe(true);
    expect(result.missingParts).toEqual([]);
  });
});
