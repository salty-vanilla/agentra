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

  it('preserves uploadedArtifacts and download URLs from response', () => {
    const raw = JSON.stringify({
      success: true,
      pptxPath: '/tmp/deck.pptx',
      uploadedArtifacts: [
        {
          kind: 'pptx',
          label: 'PowerPoint',
          localPath: '/tmp/deck.pptx',
          bucket: 'my-bucket',
          key: 'runs/run-1/deck.pptx',
          s3Uri: 's3://my-bucket/runs/run-1/deck.pptx',
          downloadUrl: 'https://s3.example.com/presigned',
          uploaded: true,
          contentType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          sizeBytes: 50000,
        },
      ],
      pptxDownloadUrl: 'https://s3.example.com/presigned',
      contactSheetDownloadUrl: 'https://s3.example.com/contact-presigned',
    });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.uploadedArtifacts).toHaveLength(1);
    const firstArtifact = result.uploadedArtifacts?.[0];
    expect(firstArtifact?.kind).toBe('pptx');
    expect(firstArtifact?.downloadUrl).toBe('https://s3.example.com/presigned');
    expect(result.pptxDownloadUrl).toBe('https://s3.example.com/presigned');
    expect(result.contactSheetDownloadUrl).toBe(
      'https://s3.example.com/contact-presigned',
    );
  });

  it('parses Strands content with uploadedArtifacts', () => {
    const inner = JSON.stringify({
      success: true,
      pptxPath: '/tmp/deck.pptx',
      pptxDownloadUrl: 'https://presigned.url/deck',
      uploadedArtifacts: [
        {
          kind: 'pptx',
          label: 'PPTX',
          localPath: '/tmp/deck.pptx',
          bucket: 'b',
          key: 'runs/r/deck.pptx',
          s3Uri: 's3://b/runs/r/deck.pptx',
          uploaded: true,
        },
      ],
    });
    const raw = JSON.stringify({ status: 'success', content: [{ text: inner }] });
    const result = parseSlideRuntimeResponse(raw);
    expect(result.success).toBe(true);
    expect(result.pptxDownloadUrl).toBe('https://presigned.url/deck');
    expect(result.uploadedArtifacts).toHaveLength(1);
  });
});
