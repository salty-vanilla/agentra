import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const generatedMockPath = path.resolve(
  process.cwd(),
  'apps/frontend/mocks/generated/agentra.msw.ts',
);

const tsNoCheckBanner = '// @ts-nocheck';
const content = await readFile(generatedMockPath, 'utf8');

if (!content.startsWith(tsNoCheckBanner)) {
  await writeFile(generatedMockPath, `${tsNoCheckBanner}\n${content}`, 'utf8');
}
