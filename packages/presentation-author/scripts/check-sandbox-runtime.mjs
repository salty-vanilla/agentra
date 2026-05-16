import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sandboxDir = join(pkgDir, '.sandbox-runtime');

const checks = [
  "require('pptxgenjs')",
  "require('jszip')",
  "require('prismjs')",
  // prism language components depend on Prism being loaded first
  "require('prismjs'); require('prismjs/components/prism-typescript')",
  "require('mathjax-full/js/mathjax.js')",
];

let ok = true;
for (const check of checks) {
  try {
    execFileSync(process.execPath, ['-e', check], { cwd: sandboxDir, stdio: 'pipe' });
    console.log(`ok  ${check}`);
  } catch (err) {
    const stderr = err.stderr?.toString().trim() ?? String(err);
    console.error(`FAIL  ${check}`);
    console.error(`      ${stderr.split('\n')[0]}`);
    ok = false;
  }
}

if (!ok) {
  console.error('\nRun: pnpm --filter @agentra/presentation-author sandbox:install');
  process.exit(1);
}
