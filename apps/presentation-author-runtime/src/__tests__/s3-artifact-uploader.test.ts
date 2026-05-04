import type { CreatePresentationToolOutput } from '@agentra/presentation-author';
import { describe, expect, it, vi } from 'vitest';
import type { UploadPresentationArtifactsDeps } from '../artifacts/s3-artifact-uploader.js';
import { uploadPresentationArtifacts } from '../artifacts/s3-artifact-uploader.js';

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-content')),
  stat: vi.fn().mockResolvedValue({ size: 12345 }),
}));

// Mock @aws-sdk/s3-request-presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

function createMockS3Client(): UploadPresentationArtifactsDeps['s3Client'] {
  return {
    send: vi.fn().mockResolvedValue({}),
  } as unknown as UploadPresentationArtifactsDeps['s3Client'];
}

function createSuccessResult(
  overrides?: Partial<CreatePresentationToolOutput>,
): CreatePresentationToolOutput {
  return {
    success: true,
    summary: 'Generated 5-slide deck',
    workDir: '/tmp/presentation-author/run-1',
    pptxPath: '/tmp/presentation-author/run-1/deck.pptx',
    sourceJsPath: '/tmp/presentation-author/run-1/presentation.js',
    contactSheetPath: '/tmp/presentation-author/run-1/contact_sheet.png',
    renderedSlidePaths: [
      '/tmp/presentation-author/run-1/rendered/slide-1.png',
      '/tmp/presentation-author/run-1/rendered/slide-2.png',
    ],
    diagnosticsStatus: 'pass',
    artifacts: [
      {
        kind: 'pptx',
        path: '/tmp/presentation-author/run-1/deck.pptx',
        label: 'PowerPoint',
        exists: true,
      },
      {
        kind: 'source-js',
        path: '/tmp/presentation-author/run-1/presentation.js',
        label: 'Source JS',
        exists: true,
      },
      {
        kind: 'contact-sheet',
        path: '/tmp/presentation-author/run-1/contact_sheet.png',
        label: 'Contact Sheet',
        exists: true,
      },
      {
        kind: 'rendered-slide',
        path: '/tmp/presentation-author/run-1/rendered/slide-1.png',
        label: 'Slide 1',
        exists: true,
      },
      {
        kind: 'rendered-slide',
        path: '/tmp/presentation-author/run-1/rendered/slide-2.png',
        label: 'Slide 2',
        exists: true,
      },
      {
        kind: 'work-dir',
        path: '/tmp/presentation-author/run-1',
        label: 'Work Dir',
        exists: true,
      },
      {
        kind: 'render-dir',
        path: '/tmp/presentation-author/run-1/rendered',
        label: 'Render Dir',
        exists: true,
      },
      {
        kind: 'diagnostics-json',
        path: '/tmp/presentation-author/run-1/diagnostics.json',
        label: 'Diagnostics',
        exists: true,
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe('uploadPresentationArtifacts', () => {
  it('uploads pptx, source-js, contact-sheet, rendered-slide, diagnostics-json', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123', prefix: 'runs' },
      { s3Client },
    );

    // Should upload 6 artifacts (pptx + source-js + contact-sheet + 2 rendered-slides + diagnostics-json)
    expect(uploadResult.uploadedArtifacts).toHaveLength(6);
    expect(s3Client.send).toHaveBeenCalledTimes(6);
    expect(uploadResult.warnings).toHaveLength(0);
  });

  it('skips work-dir and render-dir artifacts', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123' },
      { s3Client },
    );

    const kinds = uploadResult.uploadedArtifacts.map((a) => a.kind);
    expect(kinds).not.toContain('work-dir');
    expect(kinds).not.toContain('render-dir');
  });

  it('skips artifacts where exists is false', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult({
      artifacts: [
        { kind: 'pptx', path: '/tmp/deck.pptx', label: 'PowerPoint', exists: true },
        {
          kind: 'contact-sheet',
          path: '/tmp/contact.png',
          label: 'Sheet',
          exists: false,
        },
      ],
    });

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123' },
      { s3Client },
    );

    expect(uploadResult.uploadedArtifacts).toHaveLength(1);
    expect(uploadResult.uploadedArtifacts[0].kind).toBe('pptx');
  });

  it('generates expected S3 keys', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-abc', prefix: 'runs' },
      { s3Client },
    );

    const keys = uploadResult.uploadedArtifacts.map((a) => a.key);
    expect(keys).toContain('runs/run-abc/deck.pptx');
    expect(keys).toContain('runs/run-abc/presentation.js');
    expect(keys).toContain('runs/run-abc/contact_sheet.png');
    expect(keys).toContain('runs/run-abc/rendered/slide-1.png');
    expect(keys).toContain('runs/run-abc/rendered/slide-2.png');
    expect(keys).toContain('runs/run-abc/diagnostics.json');
  });

  it('sets expected content types', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123' },
      { s3Client },
    );

    const pptx = uploadResult.uploadedArtifacts.find((a) => a.kind === 'pptx');
    expect(pptx?.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );

    const js = uploadResult.uploadedArtifacts.find((a) => a.kind === 'source-js');
    expect(js?.contentType).toBe('text/javascript; charset=utf-8');

    const png = uploadResult.uploadedArtifacts.find((a) => a.kind === 'contact-sheet');
    expect(png?.contentType).toBe('image/png');

    const diag = uploadResult.uploadedArtifacts.find(
      (a) => a.kind === 'diagnostics-json',
    );
    expect(diag?.contentType).toBe('application/json');
  });

  it('returns s3Uri for each uploaded artifact', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'my-bucket', runId: 'run-xyz', prefix: 'artifacts' },
      { s3Client },
    );

    for (const artifact of uploadResult.uploadedArtifacts) {
      expect(artifact.s3Uri).toBe(`s3://my-bucket/${artifact.key}`);
      expect(artifact.uploaded).toBe(true);
    }
  });

  it('generates presigned URLs when enabled', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123', includePresignedUrls: true },
      { s3Client },
    );

    for (const artifact of uploadResult.uploadedArtifacts) {
      expect(artifact.downloadUrl).toBe('https://s3.example.com/presigned-url');
    }
  });

  it('does not generate presigned URLs when disabled', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult();

    const uploadResult = await uploadPresentationArtifacts(
      {
        result,
        bucketName: 'test-bucket',
        runId: 'run-123',
        includePresignedUrls: false,
      },
      { s3Client },
    );

    for (const artifact of uploadResult.uploadedArtifacts) {
      expect(artifact.downloadUrl).toBeUndefined();
    }
  });

  it('returns warning when result is not successful', async () => {
    const s3Client = createMockS3Client();
    const result = createSuccessResult({ success: false });

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123' },
      { s3Client },
    );

    expect(uploadResult.uploadedArtifacts).toHaveLength(0);
    expect(uploadResult.warnings).toContain(
      'Presentation generation was not successful; skipping artifact upload.',
    );
    expect(s3Client.send).not.toHaveBeenCalled();
  });

  it('adds warning on upload failure without failing entire operation', async () => {
    const s3Client = createMockS3Client();
    s3Client.send.mockRejectedValueOnce(new Error('S3 network error'));

    const result = createSuccessResult({
      artifacts: [{ kind: 'pptx', path: '/tmp/deck.pptx', label: 'PPTX', exists: true }],
    });

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123' },
      { s3Client },
    );

    expect(uploadResult.uploadedArtifacts).toHaveLength(1);
    expect(uploadResult.uploadedArtifacts[0].uploaded).toBe(false);
    expect(uploadResult.warnings).toContain('CRITICAL: PPTX artifact upload failed.');
  });

  it('adds warning on presigned URL failure but keeps upload success', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('Presign failed'));

    const s3Client = createMockS3Client();
    const result = createSuccessResult({
      artifacts: [{ kind: 'pptx', path: '/tmp/deck.pptx', label: 'PPTX', exists: true }],
    });

    const uploadResult = await uploadPresentationArtifacts(
      { result, bucketName: 'test-bucket', runId: 'run-123', includePresignedUrls: true },
      { s3Client },
    );

    expect(uploadResult.uploadedArtifacts[0].uploaded).toBe(true);
    expect(uploadResult.uploadedArtifacts[0].downloadUrl).toBeUndefined();
    expect(uploadResult.warnings.some((w) => w.includes('presigned URL'))).toBe(true);
  });
});
