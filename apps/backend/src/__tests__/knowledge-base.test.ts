import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be created before vi.mock calls
// ---------------------------------------------------------------------------
const { s3SendMock, bedrockSendMock, getSignedUrlMock } = vi.hoisted(() => {
  const s3SendMock = vi.fn();
  const bedrockSendMock = vi.fn();
  const getSignedUrlMock = vi.fn();
  return { s3SendMock, bedrockSendMock, getSignedUrlMock };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: s3SendMock })),
  ListObjectsV2Command: vi.fn((input: unknown) => ({ input })),
  DeleteObjectCommand: vi.fn((input: unknown) => ({ input })),
  PutObjectCommand: vi.fn((input: unknown) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock('@aws-sdk/client-bedrock-agent', () => ({
  BedrockAgentClient: vi.fn(() => ({ send: bedrockSendMock })),
  ListIngestionJobsCommand: vi.fn((input: unknown) => ({ input })),
  StartIngestionJobCommand: vi.fn((input: unknown) => ({ input })),
}));

// ---------------------------------------------------------------------------
// Import app after mocks are set up
// ---------------------------------------------------------------------------
import { app } from '../app.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setConfiguredEnv() {
  process.env.BEDROCK_KB_ID = 'kb-test-id';
  process.env.BEDROCK_KB_DATA_SOURCE_ID = 'ds-test-id';
  process.env.KB_DATA_SOURCE_BUCKET_NAME = 'test-bucket';
}

function clearKbEnv() {
  delete process.env.BEDROCK_KB_ID;
  delete process.env.BEDROCK_KB_DATA_SOURCE_ID;
  delete process.env.KB_DATA_SOURCE_BUCKET_NAME;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
describe('Knowledge Base API', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
    s3SendMock.mockReset();
    bedrockSendMock.mockReset();
    getSignedUrlMock.mockReset();
  });

  afterEach(() => {
    delete process.env.SKIP_AUTH;
    delete process.env.STORE_TYPE;
    clearKbEnv();
  });

  // =========================================================================
  // Unconfigured defaults
  // =========================================================================
  describe('GET /knowledge-base/status — unconfigured', () => {
    it('returns configured: false when KB env vars are missing', async () => {
      clearKbEnv();
      const res = await app.request('/knowledge-base/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ configured: false });
    });
  });

  describe('GET /knowledge-base/documents — unconfigured', () => {
    it('returns empty documents array', async () => {
      clearKbEnv();
      const res = await app.request('/knowledge-base/documents');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ documents: [] });
    });
  });

  describe('GET /knowledge-base/ingestion-jobs — unconfigured', () => {
    it('returns empty jobs array', async () => {
      clearKbEnv();
      const res = await app.request('/knowledge-base/ingestion-jobs');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ jobs: [] });
    });
  });

  // =========================================================================
  // Validation guards
  // =========================================================================
  describe('POST /knowledge-base/documents/presign — validation', () => {
    beforeEach(setConfiguredEnv);

    it('returns 400 for disallowed contentType', async () => {
      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'doc.exe',
          contentType: 'application/x-msdownload',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for sizeBytes exceeding 50MB', async () => {
      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'huge.pdf',
          contentType: 'application/pdf',
          sizeBytes: 52_428_801,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('sanitizes filename containing path separators', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example.com/presigned');
      bedrockSendMock.mockResolvedValue({ ingestionJobSummaries: [] });

      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: '../evil/../../doc.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string };
      // Key must start with upload prefix and must not contain ".." or path traversal
      expect(body.key).toMatch(/^manufacturing-line\//);
      expect(body.key).not.toContain('..');
      expect(body.key).not.toMatch(/[/\\].*[/\\]/); // no extra slashes after prefix separator
    });

    it('sanitizes filename containing backslashes', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example.com/presigned');

      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'folder\\doc.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1024,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { key: string };
      expect(body.key).not.toContain('\\');
    });
  });

  describe('DELETE /knowledge-base/documents — validation', () => {
    beforeEach(setConfiguredEnv);

    it('returns 400 when key query param is missing', async () => {
      const res = await app.request('/knowledge-base/documents', { method: 'DELETE' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for key outside manufacturing-line/ prefix', async () => {
      const res = await app.request(
        '/knowledge-base/documents?key=other-prefix%2Fdoc.pdf',
        { method: 'DELETE' },
      );
      expect(res.status).toBe(404);
    });

    it('returns 404 for empty key', async () => {
      const res = await app.request('/knowledge-base/documents?key=', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Successful AWS SDK flows (mocked)
  // =========================================================================
  describe('GET /knowledge-base/status — configured', () => {
    it('returns KB details when configured', async () => {
      setConfiguredEnv();
      const res = await app.request('/knowledge-base/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        configured: true,
        kbId: 'kb-test-id',
        dataSourceId: 'ds-test-id',
        dataSourceBucketName: 'test-bucket',
      });
    });
  });

  describe('GET /knowledge-base/documents — configured', () => {
    beforeEach(setConfiguredEnv);

    it('maps ListObjectsV2 result to KbDocument[] without contentType', async () => {
      s3SendMock.mockResolvedValue({
        Contents: [
          {
            Key: 'manufacturing-line/abc-doc.pdf',
            Size: 1024,
            LastModified: new Date('2026-01-01T00:00:00Z'),
          },
        ],
        NextContinuationToken: undefined,
      });

      const res = await app.request('/knowledge-base/documents');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { documents: unknown[] };
      expect(body.documents).toHaveLength(1);
      const doc = body.documents[0] as Record<string, unknown>;
      expect(doc.key).toBe('manufacturing-line/abc-doc.pdf');
      expect(doc.name).toBe('abc-doc.pdf');
      expect(doc.sizeBytes).toBe(1024);
      expect(doc.lastModified).toBe('2026-01-01T00:00:00.000Z');
      expect(doc).not.toHaveProperty('contentType');
    });

    it('passes nextToken as ContinuationToken and returns nextToken in response', async () => {
      s3SendMock.mockResolvedValue({
        Contents: [],
        NextContinuationToken: 'token-page-2',
      });

      const res = await app.request('/knowledge-base/documents?nextToken=token-page-1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { nextToken: string };
      expect(body.nextToken).toBe('token-page-2');

      // Verify ContinuationToken was passed
      const callArg = (s3SendMock.mock.calls[0]![0] as { input: Record<string, unknown> })
        .input;
      expect(callArg.ContinuationToken).toBe('token-page-1');
    });
  });

  describe('POST /knowledge-base/documents/presign — success', () => {
    beforeEach(setConfiguredEnv);

    it('returns presignedUrl, key, and expiresAt', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example.com/presigned?sig=abc');

      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'document.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        presignedUrl: string;
        key: string;
        expiresAt: string;
      };
      expect(body.presignedUrl).toBe('https://s3.example.com/presigned?sig=abc');
      expect(body.key).toMatch(/^manufacturing-line\//);
      expect(body.key).toContain('document.pdf');
      expect(body.expiresAt).toBeTruthy();
    });
  });

  describe('DELETE /knowledge-base/documents — success', () => {
    beforeEach(setConfiguredEnv);

    it('calls DeleteObjectCommand and returns 204', async () => {
      s3SendMock.mockResolvedValue({});
      bedrockSendMock.mockResolvedValue({ ingestionJobSummaries: [] });

      const res = await app.request(
        '/knowledge-base/documents?key=manufacturing-line%2Fdoc.pdf',
        { method: 'DELETE' },
      );
      expect(res.status).toBe(204);
      expect(s3SendMock).toHaveBeenCalledTimes(1);
    });

    it('calls StartIngestionJob after delete when no active job exists', async () => {
      s3SendMock.mockResolvedValue({});
      bedrockSendMock.mockResolvedValue({ ingestionJobSummaries: [] });

      await app.request('/knowledge-base/documents?key=manufacturing-line%2Fdoc.pdf', {
        method: 'DELETE',
      });

      // Wait for the fire-and-forget promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(bedrockSendMock).toHaveBeenCalledTimes(2); // ListIngestionJobs + StartIngestionJob
    });

    it('skips StartIngestionJob when an active job exists', async () => {
      s3SendMock.mockResolvedValue({});
      bedrockSendMock.mockResolvedValue({
        ingestionJobSummaries: [{ status: 'IN_PROGRESS', ingestionJobId: 'job-1' }],
      });

      await app.request('/knowledge-base/documents?key=manufacturing-line%2Fdoc.pdf', {
        method: 'DELETE',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(bedrockSendMock).toHaveBeenCalledTimes(1); // Only ListIngestionJobs, no Start
    });
  });

  describe('GET /knowledge-base/ingestion-jobs — success', () => {
    beforeEach(setConfiguredEnv);

    it('maps ListIngestionJobs result to IngestionJobSummary[]', async () => {
      bedrockSendMock.mockResolvedValue({
        ingestionJobSummaries: [
          {
            ingestionJobId: 'job-123',
            status: 'COMPLETE',
            startedAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:05:00Z'),
          },
        ],
      });

      const res = await app.request('/knowledge-base/ingestion-jobs');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { jobs: Array<Record<string, unknown>> };
      expect(body.jobs).toHaveLength(1);
      const job = body.jobs[0]!;
      expect(job.jobId).toBe('job-123');
      expect(job.status).toBe('COMPLETE');
      expect(job.completedAt).toBe('2026-01-01T10:05:00.000Z');
    });
  });

  describe('POST /knowledge-base/sync', () => {
    beforeEach(setConfiguredEnv);

    it('starts ingestion when no active job and returns STARTING status', async () => {
      bedrockSendMock
        .mockResolvedValueOnce({ ingestionJobSummaries: [] }) // ListIngestionJobs
        .mockResolvedValueOnce({
          ingestionJob: { ingestionJobId: 'new-job-456' },
        }); // StartIngestionJob

      const res = await app.request('/knowledge-base/sync', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { jobId: string; status: string };
      expect(body.jobId).toBe('new-job-456');
      expect(body.status).toBe('STARTING');
    });

    it('returns 409 when an IN_PROGRESS job exists', async () => {
      bedrockSendMock.mockResolvedValue({
        ingestionJobSummaries: [{ status: 'IN_PROGRESS', ingestionJobId: 'job-active' }],
      });

      const res = await app.request('/knowledge-base/sync', { method: 'POST' });
      expect(res.status).toBe(409);
    });

    it('returns 409 when a STARTING job exists', async () => {
      bedrockSendMock.mockResolvedValue({
        ingestionJobSummaries: [{ status: 'STARTING', ingestionJobId: 'job-starting' }],
      });

      const res = await app.request('/knowledge-base/sync', { method: 'POST' });
      expect(res.status).toBe(409);
    });
  });

  // =========================================================================
  // Route disambiguation
  // =========================================================================
  describe('POST /knowledge-base/documents/presign route disambiguation', () => {
    it('routes to presign handler not a dynamic segment', async () => {
      setConfiguredEnv();
      getSignedUrlMock.mockResolvedValue('https://presigned.url');

      const res = await app.request('/knowledge-base/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'test.pdf',
          contentType: 'application/pdf',
          sizeBytes: 100,
        }),
      });
      // Should reach the presign handler, not a 404 or other route
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(200);
    });
  });
});
