// ---------------------------------------------------------------------------
// LLM output JSON extraction
// ---------------------------------------------------------------------------

export type ExtractJsonTextResult = {
  jsonText: string;
  changed: boolean;
  strategy: 'raw' | 'fenced_code_block' | 'array_slice' | 'object_slice';
};

/**
 * Extract JSON text from a raw LLM output string.
 * Handles markdown fenced code blocks and leading/trailing prose.
 */
export function extractJsonText(raw: string): ExtractJsonTextResult {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return {
      jsonText: fenced[1].trim(),
      changed: true,
      strategy: 'fenced_code_block',
    };
  }

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    const sliced = firstArray !== 0 || lastArray !== trimmed.length - 1;
    const jsonText = trimmed.slice(firstArray, lastArray + 1);
    if (!sliced) {
      return { jsonText: trimmed, changed: false, strategy: 'raw' };
    }
    return { jsonText, changed: true, strategy: 'array_slice' };
  }

  const firstObj = trimmed.indexOf('{');
  const lastObj = trimmed.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) {
    const sliced = firstObj !== 0 || lastObj !== trimmed.length - 1;
    const jsonText = trimmed.slice(firstObj, lastObj + 1);
    if (!sliced) {
      return { jsonText: trimmed, changed: false, strategy: 'raw' };
    }
    return { jsonText, changed: true, strategy: 'object_slice' };
  }

  return {
    jsonText: trimmed,
    changed: false,
    strategy: 'raw',
  };
}

const MAX_PREVIEW_CHARS = 200;

function preview(s: string): string {
  if (s.length <= MAX_PREVIEW_CHARS) return s;
  return `${s.slice(0, MAX_PREVIEW_CHARS)}...[truncated]`;
}

/**
 * Parse JSON from LLM output, extracting from fenced code blocks or prose.
 * On failure, throws with extraction strategy and previews in the message.
 */
export function parseJsonFromModelOutput<T = unknown>(
  raw: string,
): {
  value: T;
  extraction: ExtractJsonTextResult;
} {
  const extraction = extractJsonText(raw);
  try {
    const value = JSON.parse(extraction.jsonText) as T;
    return { value, extraction };
  } catch (cause) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `JSON parse failed (strategy=${extraction.strategy}): ${causeMsg} | raw_preview=${preview(raw)} | extracted_preview=${preview(extraction.jsonText)}`,
    );
  }
}
