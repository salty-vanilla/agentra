import { resolve, sep } from 'node:path';

/**
 * True when `candidate` resolves to `dir` itself or a path inside it.
 *
 * Uses a separator-terminated prefix so `/out-evil` is NOT considered inside
 * `/out` (a plain `startsWith` would wrongly accept it).
 */
export function isWithinDir(candidate: string, dir: string): boolean {
  const resolvedDir = resolve(dir);
  const resolvedCandidate = resolve(candidate);
  return (
    resolvedCandidate === resolvedDir || resolvedCandidate.startsWith(resolvedDir + sep)
  );
}
