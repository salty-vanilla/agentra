import { describe, expect, it } from 'vitest';
import { parseSlideRuntimeResponse } from '../lib/bedrock-slide-agent.js';

describe('parseSlideRuntimeResponse', () => {
  it('parses direct JSON with success: true', () => {
    const raw = JSON.stringify({
      success: true,
      pptxPath: '/tmp/deck.pptx',
      diagnosticsStatus: 'pass',
      artifacts: [],
    });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxPath).toBe('/tmp/deck.pptx');
    expect(result.diagnosticsStatus).toBe('pass');
  });

  it('parses direct JSON with success: false', () => {
    const raw = JSON.stringify({
      success: false,
      error: { message: 'timeout', phase: 'execution' },
    });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('timeout');
    expect(result.error?.phase).toBe('execution');
  });

  it('unwraps Strands content response shape', () => {
    const inner = JSON.stringify({
      success: true,
      pptxPath: '/tmp/out/deck.pptx',
      contactSheetPath: '/tmp/out/contact_sheet.png',
    });
    const raw = JSON.stringify({
      status: 'success',
      content: [{ text: inner }],
    });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxPath).toBe('/tmp/out/deck.pptx');
    expect(result.contactSheetPath).toBe('/tmp/out/contact_sheet.png');
  });

  it('returns rawText for unparsable response', () => {
    const raw = 'This is not JSON at all';
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(false);
    expect(result.rawText).toBe(raw);
    expect(result.error?.phase).toBe('response-parsing');
  });

  it('extracts JSON from mixed text containing success field', () => {
    const json = JSON.stringify({
      success: true,
      pptxPath: '/tmp/x/deck.pptx',
    });
    const raw = `data: some prefix\n${json}`;
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxPath).toBe('/tmp/x/deck.pptx');
  });
});
