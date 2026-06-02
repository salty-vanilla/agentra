import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportSvg } from '../export-svg.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_SCRIPT = join(__dirname, '..', '..', '..', 'python', 'export_svg.py');

let tmp: string;

/** Write a throwaway python stub that prints a fixed stdout and exit code. */
async function writeStub(name: string, body: string): Promise<string> {
  const p = join(tmp, name);
  await writeFile(p, body, 'utf8');
  return p;
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'export-svg-test-'));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('exportSvg wrapper', () => {
  it('returns success with svgPath when the script reports success', async () => {
    const script = await writeStub(
      'ok.py',
      'import json,sys; print(json.dumps({"success": True, "svgPath": "/out/deck.svg"}))',
    );
    const r = await exportSvg({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.svgPath).toBe('/out/deck.svg');
    expect(r.warnings).toEqual([]);
  });

  it('degrades (no throw) when the script reports a structured error', async () => {
    const script = await writeStub(
      'err.py',
      'import json,sys; print(json.dumps({"success": False, "error": "soffice not found"})); sys.exit(1)',
    );
    const r = await exportSvg({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.svgPath).toBeNull();
    expect(r.warnings.join(' ')).toContain('soffice not found');
  });

  it('degrades when the script emits unparseable output', async () => {
    const script = await writeStub('garbage.py', 'print("not json at all")');
    const r = await exportSvg({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.svgPath).toBeNull();
    expect(r.warnings.join(' ')).toContain('no parseable JSON');
  });

  it('real export_svg.py reports a structured error for a missing input (no soffice needed)', async () => {
    const r = await exportSvg({
      pptxPath: join(tmp, 'does-not-exist.pptx'),
      outputDir: tmp,
      scriptPath: REAL_SCRIPT,
    });
    expect(r.success).toBe(false);
    expect(r.svgPath).toBeNull();
    expect(r.warnings.join(' ')).toContain('input not found');
  });
});
