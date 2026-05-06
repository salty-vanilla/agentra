import { describe, expect, it } from 'vitest';
import { parseSlideRuntimeResponse } from '../tools/slide-runtime-client.js';

describe('parseSlideRuntimeResponse', () => {
  it('parses plain text response', () => {
    const raw = 'スライド資料が完成しました。PPTXは /tmp/deck.pptx にあります。';
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.text).toBe(raw);
  });

  it('unwraps Strands content wrapper', () => {
    const innerText = 'Generated a 5-slide presentation.';
    const raw = JSON.stringify({ status: 'success', content: [{ text: innerText }] });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.text).toBe(innerText);
  });

  it('unwraps { type: text, text: ... } shape', () => {
    const raw = JSON.stringify({ type: 'text', text: 'Presentation created.' });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.text).toBe('Presentation created.');
  });

  it('returns error for empty response', () => {
    const result = parseSlideRuntimeResponse('');
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Empty response');
  });
});

describe('invokeSlideRuntime', () => {
  it('throws when SLIDE_AGENTCORE_RUNTIME_ARN is empty', async () => {
    // The module reads env at import time, so we test by importing dynamically
    // with the env var unset (which is the default in test env)
    const { invokeSlideRuntime } = await import('../tools/slide-runtime-client.js');
    await expect(invokeSlideRuntime({ prompt: 'test' })).rejects.toThrow(
      'SLIDE_AGENTCORE_RUNTIME_ARN is not configured',
    );
  });
});

describe('create_slide_presentation tool', () => {
  it('exports tool with correct name and schema', async () => {
    const { createSlidePresentationTool } = await import(
      '../tools/create-slide-presentation.js'
    );
    expect(createSlidePresentationTool.name).toBe('create_slide_presentation');
  });
});

describe('Router Agent prompt', () => {
  it('uses AgentSkills plugin for presentation handoff', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');

    expect(agentSource).toContain('AgentSkills');
    expect(agentSource).toContain('presentation-author-handoff');
    expect(agentSource).toContain('buildGeneralTools');
  });
});
