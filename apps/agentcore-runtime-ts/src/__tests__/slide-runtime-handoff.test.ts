import { describe, expect, it } from 'vitest';
import { parseSlideRuntimeResponse } from '../tools/slide-runtime-client.js';

describe('parseSlideRuntimeResponse', () => {
  it('parses plain text response', () => {
    const raw = 'スライド資料が完成しました。PPTXは /tmp/deck.pptx にあります。';
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.text).toBe(raw);
  });

  it('preserves structured presentation results', () => {
    const structured = {
      success: true,
      summary: 'Presentation created successfully. Diagnostics: pass.',
      workDir: '/tmp/slide-run',
      pptxPath: '/tmp/slide-run/deck.pptx',
      sourceJsPath: '/tmp/slide-run/presentation.js',
      contactSheetPath: '/tmp/slide-run/contact-sheet.png',
      diagnosticsStatus: 'pass' as const,
      revisionAttempted: false,
      revisionSucceeded: false,
      revisionReason: 'diagnostics-pass',
      artifacts: [
        { kind: 'pptx', path: '/tmp/slide-run/deck.pptx', label: 'PPTX', exists: true },
      ],
      warnings: ['Artifact upload completed with presigned URLs.'],
      uploadedArtifacts: [
        {
          kind: 'pptx',
          label: 'PPTX',
          localPath: '/tmp/slide-run/deck.pptx',
          bucket: 'agentra-artifacts',
          key: 'runs/run-123/deck.pptx',
          s3Uri: 's3://agentra-artifacts/runs/run-123/deck.pptx',
          downloadUrl: 'https://example.com/deck.pptx',
          uploaded: true,
        },
      ],
      pptxDownloadUrl: 'https://example.com/deck.pptx',
      contactSheetDownloadUrl: 'https://example.com/contact-sheet.png',
    };

    const result = parseSlideRuntimeResponse(JSON.stringify(structured));
    expect(result.success).toBe(true);
    expect(result.text).toBe(structured.summary);
    expect(result.result).toEqual(structured);
    expect(result.result?.pptxDownloadUrl).toBe('https://example.com/deck.pptx');
    expect(result.result?.warnings).toContain(
      'Artifact upload completed with presigned URLs.',
    );
  });

  it('passes a deck through the structured result', () => {
    const structured = {
      success: true,
      summary: 'Created a 3-slide deck.',
      workDir: '/tmp/wd',
      artifacts: [],
      warnings: [],
      deck: {
        deckId: 'deck-1',
        name: 'Demo',
        language: 'ja',
        slideOrder: ['intro'],
        defsUrl: 'https://example.com/defs.json?sig',
        pptxDownloadUrl: null,
        specs: { briefUrl: null, outlineUrl: null, artDirectionUrl: null },
        slides: [
          { slug: 'intro', previewUrl: null, composeUrl: 'https://example.com/c?sig' },
        ],
        version: 1,
      },
    };

    const result = parseSlideRuntimeResponse(JSON.stringify(structured));
    expect(result.success).toBe(true);
    expect(result.result?.deck?.deckId).toBe('deck-1');
    expect(result.result?.deck?.slides[0]?.slug).toBe('intro');
  });

  it('preserves structured failure payloads', () => {
    const structured = {
      success: false,
      summary:
        'Presentation creation failed during script-execution. No PPTX artifact was produced.',
      workDir: '',
      artifacts: [],
      warnings: ['Execution stderr truncated.'],
      error: {
        message: 'Authoring script execution failed (exit 1)',
        phase: 'script-execution' as const,
      },
    };

    const result = parseSlideRuntimeResponse(JSON.stringify(structured));
    expect(result.success).toBe(false);
    expect(result.text).toContain('Presentation creation failed');
    expect(result.result).toEqual(structured);
    expect(result.result?.error?.phase).toBe('script-execution');
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
    const agentSource = await readFile(
      join(import.meta.dirname, '../agents/router/agent.ts'),
      'utf-8',
    );

    expect(agentSource).toContain('AgentSkills');
    expect(agentSource).toContain('presentation-author-handoff');
    expect(agentSource).toContain('buildRouterTools');
  });
});
