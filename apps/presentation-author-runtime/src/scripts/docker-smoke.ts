/**
 * Docker smoke test: verifies container dependencies are available.
 * Run inside container: node dist/scripts/docker-smoke.js
 */
import { execSync } from 'node:child_process';

interface CheckResult {
  name: string;
  ok: boolean;
  output: string;
}

const results: CheckResult[] = [];

function check(name: string, cmd: string, optional = false): void {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10_000 }).trim();
    results.push({ name, ok: true, output: output.split('\n')[0] ?? '' });
  } catch (e) {
    const msg = e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e);
    results.push({
      name,
      ok: !!optional,
      output: optional ? `SKIP: ${msg}` : `FAIL: ${msg}`,
    });
  }
}

function checkImport(name: string, mod: string, optional = false): void {
  try {
    const output = execSync(
      `node -e "import('${mod}').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })"`,
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim();
    results.push({ name, ok: true, output });
  } catch (e) {
    const msg = e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e);
    results.push({
      name,
      ok: !!optional,
      output: optional ? `SKIP: ${msg}` : `FAIL: ${msg}`,
    });
  }
}

console.log('=== Docker Smoke Test ===\n');

check('node', 'node --version');
check('python3', 'python3 --version');
check('soffice', 'soffice --version');
check('pdfinfo', 'pdfinfo -v 2>&1 | head -1');
check('pdftoppm', 'pdftoppm -v 2>&1 | head -1');
check('fc-list', 'fc-list | grep -i "Noto Sans CJK" | head -1');
check('fontconfig', 'fc-cache --version 2>&1 | head -1');

// Python packages
check('python-pptx', 'python3 -c "import pptx; print(pptx.__version__)"');
check('PIL', 'python3 -c "from PIL import Image; print(Image.__version__)"');

// Node modules
check(
  'pptxgenjs (from presentation-author)',
  "cd /app/packages/presentation-author && node -e \"import('pptxgenjs').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })\"",
);
checkImport('@agentra/presentation-author', '@agentra/presentation-author');
checkImport('skia-canvas', 'skia-canvas', true);

console.log('Results:');
let failed = 0;
for (const r of results) {
  const status = r.ok ? '✓' : '✗';
  console.log(`  ${status} ${r.name}: ${r.output}`);
  if (!r.ok) failed++;
}

console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (failed > 0) {
  console.error(`\n${failed} check(s) FAILED.`);
  process.exit(1);
}
console.log('\nSmoke test PASSED.');
