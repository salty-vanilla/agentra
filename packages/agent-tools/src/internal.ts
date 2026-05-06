export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function compactStringArray(
  values: readonly (string | undefined)[] | undefined,
): string[] | undefined {
  if (!values) return undefined;
  const result = dedupePreserveOrder(
    values
      .map((value) => normalizeText(value))
      .filter((value): value is string => Boolean(value)),
  );
  return result.length > 0 ? result : undefined;
}

export function dedupePreserveOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function compactRecord<T extends Record<string, unknown>>(value: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const compacted = compactValue(entry);
    if (compacted !== undefined) {
      result[key] = compacted;
    }
  }
  return result as Partial<T>;
}

export function compactValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    return normalizeText(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const compacted = value
      .map((entry) => compactValue(entry))
      .filter((entry): entry is Exclude<unknown, undefined> => entry !== undefined);
    return compacted.length > 0 ? compacted : undefined;
  }
  if (isPlainObject(value)) {
    const compacted = compactRecord(value);
    return Object.keys(compacted).length > 0 ? compacted : undefined;
  }
  return undefined;
}

export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
      return 'null';
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
      }
      if (isPlainObject(value)) {
        const entries = Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
        return `{${entries.join(',')}}`;
      }
      return JSON.stringify(String(value));
    default:
      return JSON.stringify(String(value));
  }
}

export function stableHash(input: unknown): string {
  const text = stableStringify(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createStableId(prefix: string, input: unknown): string {
  return `${prefix}-${stableHash(input)}`;
}
