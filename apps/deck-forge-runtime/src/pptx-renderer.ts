import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLogger } from './logging.js';

export type RenderedSlide = {
  index: number; // 0-based slide index
  png: Buffer;
};

export type RenderPptxOptions = {
  pptxPath: string;
  /** Override the work directory. Defaults to a fresh tmp dir. */
  workDir?: string;
  /** PNG resolution in DPI. Defaults to 110 (~1280x720 for a 16:9 slide). */
  dpi?: number;
};

/**
 * Render a pptx file into one PNG per slide using LibreOffice (pptx -> pdf)
 * followed by poppler's `pdftoppm` (pdf -> png[]).
 *
 * Both binaries are installed in the deck-forge-runtime Docker image.
 * Locally you need:
 *   - libreoffice (`soffice` on PATH)
 *   - poppler-utils (`pdftoppm` on PATH)
 */
export async function renderPptxToPngs(
  options: RenderPptxOptions,
): Promise<RenderedSlide[]> {
  const log = getLogger();
  const dpi = options.dpi ?? 110;
  const workDir =
    options.workDir ?? (await mkdtempLike(join(tmpdir(), 'deck-forge-render-')));

  await mkdir(workDir, { recursive: true });
  const startedAt = Date.now();

  // Step 1: pptx -> pdf
  // soffice writes <basename>.pdf into --outdir.
  log.info(
    { pptxPath: options.pptxPath, workDir },
    '[deck-forge-runtime] [pptx-renderer] converting pptx -> pdf via soffice',
  );
  await runProcess('soffice', [
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nofirststartwizard',
    '--convert-to',
    'pdf',
    '--outdir',
    workDir,
    options.pptxPath,
  ]);

  const pdfFiles = (await readdir(workDir)).filter((name) => name.endsWith('.pdf'));
  if (pdfFiles.length === 0) {
    throw new Error(`soffice produced no pdf in ${workDir}`);
  }
  const pdfPath = join(workDir, pdfFiles[0] ?? '');

  // Step 2: pdf -> png-N.png via pdftoppm
  log.info(
    { pdfPath, dpi },
    '[deck-forge-runtime] [pptx-renderer] converting pdf -> png[] via pdftoppm',
  );
  await runProcess('pdftoppm', [
    '-png',
    '-r',
    String(dpi),
    pdfPath,
    join(workDir, 'slide'),
  ]);

  // pdftoppm names files slide-1.png, slide-2.png, ... (or slide-01.png, depending on count)
  const pngFiles = (await readdir(workDir))
    .filter((name) => name.startsWith('slide-') && name.endsWith('.png'))
    .sort((a, b) => extractSlideNumber(a) - extractSlideNumber(b));

  const slides: RenderedSlide[] = [];
  for (const [i, name] of pngFiles.entries()) {
    const png = await readFile(join(workDir, name));
    slides.push({ index: i, png });
  }

  log.info(
    {
      pptxPath: options.pptxPath,
      slideCount: slides.length,
      durationMs: Date.now() - startedAt,
    },
    '[deck-forge-runtime] [pptx-renderer] done',
  );

  // Cleanup tmp dir if we owned it.
  if (options.workDir === undefined) {
    rm(workDir, { recursive: true, force: true }).catch(() => {});
  }

  return slides;
}

function extractSlideNumber(name: string): number {
  const match = name.match(/slide-(\d+)\.png$/);
  return match ? Number.parseInt(match[1] ?? '0', 10) : 0;
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}

async function mkdtempLike(prefix: string): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(prefix);
}
