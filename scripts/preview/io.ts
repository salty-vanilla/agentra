/**
 * Filesystem helpers for preview artifacts. Side-effecting; parent directories
 * are created on write. JSON is pretty-printed with a trailing newline.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function writeJsonFile(filePath: string, data: unknown): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeTextFile(filePath: string, content: string): void {
  ensureParentDir(filePath);
  const normalized =
    content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  writeFileSync(filePath, normalized, 'utf8');
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
