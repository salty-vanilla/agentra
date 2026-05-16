import { execSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(pkgDir, 'sandbox-runtime');
const destDir = join(pkgDir, '.sandbox-runtime');

await mkdir(destDir, { recursive: true });
await Promise.all([
  copyFile(join(srcDir, 'package.json'), join(destDir, 'package.json')),
  copyFile(join(srcDir, 'package-lock.json'), join(destDir, 'package-lock.json')),
]);
execSync('npm ci --omit=dev', { cwd: destDir, stdio: 'inherit' });
console.log(`Sandbox runtime installed at ${destDir}`);
