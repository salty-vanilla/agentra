import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const deckForgePackageSrcRoots = [
  'packages/deck-forge/core/src',
  'packages/deck-forge/tools/src',
  'packages/deck-forge/cli/src',
  'packages/deck-forge/mcp-server/src',
  'packages/deck-forge/runner/src',
  'packages/deck-forge/adapters/src',
];

export default defineConfig({
  plugins: [
    {
      name: 'deck-forge-hash-alias',
      resolveId(source, importer) {
        if (!source.startsWith('#src/') || !importer) {
          return null;
        }

        const normalizedImporter = importer.replaceAll(path.sep, '/');
        const packageRoot = deckForgePackageSrcRoots.find((root) =>
          normalizedImporter.includes(`/${root}/`),
        );
        if (!packageRoot) {
          return null;
        }

        const subPath = source.slice('#src/'.length);
        const absolutePath = path.resolve(process.cwd(), packageRoot, subPath);

        if (absolutePath.endsWith('.js')) {
          const tsPath = `${absolutePath.slice(0, -3)}.ts`;
          if (fs.existsSync(tsPath)) {
            return tsPath;
          }
        }

        return absolutePath;
      },
    },
  ],
});
