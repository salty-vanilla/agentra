import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sandboxDir = join(pkgDir, '.sandbox-runtime');
const packages = ['pptxgenjs', 'jszip', 'prismjs', 'mathjax-full'];

let ok = true;
for (const pkg of packages) {
  try {
    await access(join(sandboxDir, 'node_modules', pkg));
    console.log(`ok  ${pkg}`);
  } catch {
    console.error(`MISSING  ${pkg}`);
    ok = false;
  }
}

if (!ok) {
  console.error('\nRun: pnpm --filter @agentra/presentation-author sandbox:install');
  process.exit(1);
}
