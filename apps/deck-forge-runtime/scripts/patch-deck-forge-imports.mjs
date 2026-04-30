import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageNames = ['@deck-forge/core', '@deck-forge/tools', '@deck-forge/runner'];
const fileExtensions = new Set(['.js', '.d.ts']);

for (const packageName of packageNames) {
  const packageRoot = resolve(appRoot, 'node_modules', packageName);
  await patchPackage(packageRoot);
}

async function patchPackage(packageRoot) {
  const distRoot = resolve(packageRoot, 'dist');
  const files = await listFiles(distRoot);

  for (const file of files) {
    if (!shouldPatch(file)) {
      continue;
    }

    const source = await readFile(file, 'utf8');
    const patched = patchSource(source, file, distRoot);
    if (patched !== source) {
      await writeFile(file, patched);
    }
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else {
      files.push(path);
    }
  }

  return files;
}

function shouldPatch(path) {
  return [...fileExtensions].some((extension) => path.endsWith(extension));
}

function patchSource(source, file, distRoot) {
  return source.replace(
    /((?:from\s+|import\s*\(\s*)["'])#\/([^"']+)(["'])/g,
    (_match, prefix, specifier, suffix) => {
      const target = resolve(distRoot, specifier);
      let nextSpecifier = relative(dirname(file), target).replaceAll('\\', '/');
      if (!nextSpecifier.startsWith('.')) {
        nextSpecifier = `./${nextSpecifier}`;
      }
      return `${prefix}${nextSpecifier}${suffix}`;
    },
  );
}
