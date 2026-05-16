import { execSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(pkgDir, '.sandbox-runtime');

await mkdir(destDir, { recursive: true });
await copyFile(
  join(pkgDir, 'sandbox-runtime', 'package.json'),
  join(destDir, 'package.json'),
);
execSync('npm install --omit=dev', { cwd: destDir, stdio: 'inherit' });
console.log(`Sandbox runtime installed at ${destDir}`);
