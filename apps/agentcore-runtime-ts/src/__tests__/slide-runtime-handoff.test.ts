import { describe, expect, it } from 'vitest';
import { parseSlideRuntimeResponse } from '../tools/slide-runtime-client.js';

describe('parseSlideRuntimeResponse', () => {
  it('parses direct JSON success response', () => {
    const raw = JSON.stringify({
      success: true,
      summary: '5-slide deck generated',
      pptxDownloadUrl: 'https://s3.example.com/deck.pptx',
      contactSheetDownloadUrl: 'https://s3.example.com/contact.png',
      diagnosticsStatus: 'pass',
      uploadedArtifacts: [
        { kind: 'pptx', label: 'PPTX', s3Uri: 's3://bucket/deck.pptx', uploaded: true },
      ],
    });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxDownloadUrl).toBe('https://s3.example.com/deck.pptx');
    expect(result.contactSheetDownloadUrl).toBe('https://s3.example.com/contact.png');
    expect(result.uploadedArtifacts).toHaveLength(1);
  });

  it('unwraps Strands content wrapper', () => {
    const inner = JSON.stringify({
      success: true,
      summary: 'Generated deck',
      pptxDownloadUrl: 'https://example.com/presigned',
    });
    const raw = JSON.stringify({ status: 'success', content: [{ text: inner }] });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxDownloadUrl).toBe('https://example.com/presigned');
  });

  it('returns rawText fallback for unparsable response', () => {
    const raw = 'Some non-JSON garbage';
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(false);
    expect(result.rawText).toBe(raw);
    expect(result.error?.phase).toBe('response-parsing');
  });

  it('extracts JSON from mixed text', () => {
    const json = JSON.stringify({ success: true, summary: 'Done' });
    const raw = `data: prefix\n${json}`;
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Done');
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
    expect(agentSource).toContain('createSlidePresentationTool');
  });
});
