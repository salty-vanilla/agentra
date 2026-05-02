import { describe, expect, it } from 'vitest';
import { extractJsonText, parseJsonFromModelOutput } from '../json-extraction.js';

describe('extractJsonText', () => {
  it('raw JSON array passes through unchanged', () => {
    const raw = '[{"a":1},{"b":2}]';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('raw');
    expect(result.changed).toBe(false);
    expect(result.jsonText).toBe(raw);
  });

  it('raw JSON object passes through unchanged', () => {
    const raw = '{"key":"value"}';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('raw');
    expect(result.changed).toBe(false);
    expect(result.jsonText).toBe(raw);
  });

  it('fenced ```json array is extracted', () => {
    const raw = '```json\n[{"code":"x","severity":"error"}]\n```';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('fenced_code_block');
    expect(result.changed).toBe(true);
    expect(result.jsonText).toBe('[{"code":"x","severity":"error"}]');
  });

  it('fenced ``` (no language tag) object is extracted', () => {
    const raw = '```\n{"key":"value"}\n```';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('fenced_code_block');
    expect(result.changed).toBe(true);
    expect(result.jsonText).toBe('{"key":"value"}');
  });

  it('leading prose + array is extracted via array_slice', () => {
    const raw = 'Here are the issues:\n[{"code":"x"}]';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('array_slice');
    expect(result.changed).toBe(true);
    expect(result.jsonText).toBe('[{"code":"x"}]');
  });

  it('trailing prose + object is extracted via object_slice', () => {
    const raw = '{"status":"ok"}\n\nThat is all.';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('object_slice');
    expect(result.changed).toBe(true);
    expect(result.jsonText).toBe('{"status":"ok"}');
  });

  it('leading and trailing prose with array uses array_slice', () => {
    const raw = 'Sure! Here:\n[1,2,3]\nDone.';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('array_slice');
    expect(result.jsonText).toBe('[1,2,3]');
  });

  it('array_slice is preferred over object_slice when both are present', () => {
    const raw = 'prefix [{"a":1}] suffix';
    const result = extractJsonText(raw);
    expect(result.strategy).toBe('array_slice');
    expect(result.jsonText).toBe('[{"a":1}]');
  });
});

describe('parseJsonFromModelOutput', () => {
  it('parses raw JSON array', () => {
    const { value, extraction } = parseJsonFromModelOutput<unknown[]>('[1,2,3]');
    expect(value).toEqual([1, 2, 3]);
    expect(extraction.strategy).toBe('raw');
  });

  it('parses fenced JSON array', () => {
    const raw = '```json\n[{"code":"err"}]\n```';
    const { value } = parseJsonFromModelOutput<unknown[]>(raw);
    expect(Array.isArray(value)).toBe(true);
    expect((value as { code: string }[])[0]?.code).toBe('err');
  });

  it('throws with strategy and preview on invalid JSON', () => {
    expect(() => parseJsonFromModelOutput('not valid json')).toThrow(/strategy=raw/);
  });

  it('error message includes raw_preview and extracted_preview', () => {
    try {
      parseJsonFromModelOutput('```json\ninvalid\n```');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      expect(msg).toContain('strategy=fenced_code_block');
      expect(msg).toContain('raw_preview=');
      expect(msg).toContain('extracted_preview=');
    }
  });
});
