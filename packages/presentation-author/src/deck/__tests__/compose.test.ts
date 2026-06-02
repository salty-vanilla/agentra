import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { composeSvg } from '../compose.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..', '..', '..');
const REAL_SCRIPT = join(PKG_ROOT, 'python', 'compose_slides.py');
const FIXTURE_SVG = join(PKG_ROOT, 'fixtures', 'deck', 'synthetic.svg');

const PYTHON_BIN = process.env.PRESENTATION_AUTHOR_PYTHON_BIN ?? 'python3';

/** Real compose needs lxml + Pillow; skip the golden test where they are absent. */
function hasComposeDeps(): boolean {
  try {
    execFileSync(PYTHON_BIN, ['-c', 'import lxml, PIL'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let tmp: string;

async function writeStub(name: string, body: string): Promise<string> {
  const p = join(tmp, name);
  await writeFile(p, body, 'utf8');
  return p;
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'compose-test-'));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('composeSvg wrapper (deps-free)', () => {
  it('parses a successful summary into typed slides', async () => {
    const script = await writeStub(
      'ok.py',
      'import json; print(json.dumps({"success": True, "defsPath": "/out/defs.json", "slides": [{"slug": "slide-1", "index": 1, "composePath": "/out/slide-1.compose.json"}], "warnings": []}))',
    );
    const r = await composeSvg({
      svgPath: '/in/deck.svg',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.defsPath).toBe('/out/defs.json');
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0]).toEqual({
      slug: 'slide-1',
      index: 1,
      composePath: '/out/slide-1.compose.json',
    });
  });

  it('drops slide entries whose path escapes outputDir', async () => {
    const script = await writeStub(
      'escape.py',
      'import json; print(json.dumps({"success": True, "defsPath": "/out/defs.json", "slides": [{"slug": "x", "index": 1, "composePath": "/etc/passwd"}], "warnings": []}))',
    );
    const r = await composeSvg({
      svgPath: '/in/deck.svg',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.slides).toHaveLength(0);
  });

  it('drops slide entries whose path is a sibling sharing a name prefix', async () => {
    const script = await writeStub(
      'prefix.py',
      'import json; print(json.dumps({"success": True, "defsPath": "/out/defs.json", "slides": [{"slug": "x", "index": 1, "composePath": "/out-evil/secrets"}], "warnings": []}))',
    );
    const r = await composeSvg({
      svgPath: '/in/deck.svg',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(true);
    expect(r.slides).toHaveLength(0);
  });

  it('degrades on a structured error', async () => {
    const script = await writeStub(
      'err.py',
      'import json,sys; print(json.dumps({"success": False, "error": "failed to parse svg"})); sys.exit(1)',
    );
    const r = await composeSvg({
      svgPath: '/in/deck.svg',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.defsPath).toBeNull();
    expect(r.slides).toEqual([]);
    expect(r.warnings.join(' ')).toContain('failed to parse svg');
  });

  it('degrades on unparseable output', async () => {
    const script = await writeStub('garbage.py', 'print("not json")');
    const r = await composeSvg({
      svgPath: '/in/deck.svg',
      outputDir: '/out',
      scriptPath: script,
    });
    expect(r.success).toBe(false);
    expect(r.warnings.join(' ')).toContain('no parseable JSON');
  });
});

describe.skipIf(!hasComposeDeps())('compose_slides.py golden (real lxml/Pillow)', () => {
  it('produces defs.json + one content compose with changed:false and WebP', async () => {
    const outDir = join(tmp, 'golden');
    const r = await composeSvg({
      svgPath: FIXTURE_SVG,
      outputDir: outDir,
      slugs: ['intro'],
      scriptPath: REAL_SCRIPT,
    });

    expect(r.success).toBe(true);
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0]?.slug).toBe('intro');
    expect(r.slides[0]?.index).toBe(1);

    // defs: fonts stripped.
    const defs = JSON.parse(await readFile(join(outDir, 'defs.json'), 'utf8'));
    expect(defs.version).toBe(1);
    expect(defs.defs).not.toContain('<font');

    // compose: structure + hardening invariants.
    const compose = JSON.parse(
      await readFile(join(outDir, 'intro.compose.json'), 'utf8'),
    );
    expect(compose.version).toBe(1);
    expect(compose.viewBox).toBe('0 0 33867 19050');
    expect(compose.bgFill).toBe('#232F3E'); // resolved from master background
    expect(compose.components.length).toBe(2);
    expect(
      compose.components.every((c: { changed: boolean }) => c.changed === false),
    ).toBe(true);
    // The GraphicObject's inline PNG must be WebP-encoded.
    const svgBlob = compose.components.map((c: { svg: string }) => c.svg).join('');
    expect(svgBlob).toContain('image/webp');
    expect(svgBlob).not.toContain('image/png');
  });
});
