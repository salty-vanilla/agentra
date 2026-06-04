import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { splitPptx } from '../split-pptx.js';

let tmp: string;

/** Write a throwaway python stub that prints a fixed stdout and exit code. */
async function writeStub(name: string, body: string): Promise<string> {
  const p = join(tmp, name);
  await writeFile(p, body, 'utf8');
  return p;
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'split-pptx-test-'));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('splitPptx wrapper', () => {
  it('returns ordered per-slide PPTX paths when the script reports success', async () => {
    const script = await writeStub(
      'ok.py',
      [
        'import json',
        'print(json.dumps({"success": True, "slides": [',
        '  {"index": 1, "pptxPath": "/out/slide-1.pptx"},',
        '  {"index": 2, "pptxPath": "/out/slide-2.pptx"}',
        ']}))',
      ].join('\n'),
    );
    const r = await splitPptx({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.slides).toEqual([
      { index: 1, pptxPath: '/out/slide-1.pptx' },
      { index: 2, pptxPath: '/out/slide-2.pptx' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('degrades (no throw) when the script reports a structured error', async () => {
    const script = await writeStub(
      'err.py',
      [
        'import json, sys',
        'print(json.dumps({"success": False, "error": "python-pptx not installed"}))',
        'sys.exit(1)',
      ].join('\n'),
    );
    const r = await splitPptx({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.slides).toEqual([]);
    expect(r.warnings.join(' ')).toContain('python-pptx not installed');
  });

  it('degrades when the script emits unparseable output', async () => {
    const script = await writeStub('garbage.py', 'print("not json at all")');
    const r = await splitPptx({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.slides).toEqual([]);
    expect(r.warnings.join(' ')).toContain('no parseable JSON');
  });

  it('drops slide entries whose pptxPath escapes the output dir (defense in depth)', async () => {
    const script = await writeStub(
      'escape.py',
      [
        'import json',
        'print(json.dumps({"success": True, "slides": [',
        '  {"index": 1, "pptxPath": "/out/slide-1.pptx"},',
        '  {"index": 2, "pptxPath": "/etc/passwd"}',
        ']}))',
      ].join('\n'),
    );
    const r = await splitPptx({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.slides).toEqual([{ index: 1, pptxPath: '/out/slide-1.pptx' }]);
  });

  it('degrades when success is true but no slides are returned', async () => {
    const script = await writeStub(
      'empty.py',
      'import json; print(json.dumps({"success": True, "slides": []}))',
    );
    const r = await splitPptx({
      pptxPath: '/in/deck.pptx',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.slides).toEqual([]);
    expect(r.warnings.join(' ')).toContain('no slides');
  });
});
