import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Hono } from 'hono';
import { uuidv7 } from 'uuidv7';
import { jsonWithValidation, readJsonBody, validateRequest } from '../lib/openapi.js';

type HonoEnv = {
  Variables: { userId: string; requestId: string };
};

const S3_UPLOAD_PREFIX = 'manufacturing-line/';
const PRESIGN_EXPIRES_SECONDS = 900; // 15 minutes
const MAX_DECLARED_SIZE_BYTES = 52_428_800; // 50 MB
const MAX_INGESTION_JOBS = 10;

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Read env vars at request time so tests can control them via beforeEach
function kbConfig() {
  return {
    kbId: process.env.BEDROCK_KB_ID ?? '',
    dataSourceId: process.env.BEDROCK_KB_DATA_SOURCE_ID ?? '',
    bucketName: process.env.KB_DATA_SOURCE_BUCKET_NAME ?? '',
  };
}

function isConfigured(): boolean {
  const { kbId, bucketName } = kbConfig();
  return kbId.length > 0 && bucketName.length > 0;
}

// Lazy-initialized SDK clients — reused across Lambda warm starts
let s3: S3Client | null = null;
let bedrockAgent: BedrockAgentClient | null = null;

function getS3(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

function getBedrockAgent(): BedrockAgentClient {
  if (!bedrockAgent) bedrockAgent = new BedrockAgentClient({});
  return bedrockAgent;
}

// Strip path separators, null bytes, and dot-dot sequences from a filename.
function sanitizeFileName(name: string): string {
  return name.replace(/\.\./g, '_').replace(/[/\\]/g, '_').trim().replace(/^\.+/, '_');
}

function isActiveStatus(status: string | undefined): boolean {
  return status === 'IN_PROGRESS' || status === 'STARTING';
}

async function hasActiveIngestionJob(cfg: ReturnType<typeof kbConfig>): Promise<boolean> {
  if (!cfg.dataSourceId) return false;
  try {
    const result = await getBedrockAgent().send(
      new ListIngestionJobsCommand({
        knowledgeBaseId: cfg.kbId,
        dataSourceId: cfg.dataSourceId,
        maxResults: 5,
      }),
    );
    return (result.ingestionJobSummaries ?? []).some((j) => isActiveStatus(j.status));
  } catch {
    return false;
  }
}

export const knowledgeBaseRouter = new Hono<HonoEnv>();

knowledgeBaseRouter.get('/status', async (c) => {
  if (!isConfigured()) {
    return jsonWithValidation(c, 'getKbStatus', 200, { configured: false });
  }
  const { kbId, dataSourceId, bucketName } = kbConfig();
  return jsonWithValidation(c, 'getKbStatus', 200, {
    configured: true,
    kbId,
    dataSourceId,
    dataSourceBucketName: bucketName,
  });
});

knowledgeBaseRouter.get('/documents', async (c) => {
  if (!isConfigured()) {
    return jsonWithValidation(c, 'listKbDocuments', 200, { documents: [] });
  }

  const { bucketName } = kbConfig();
  const nextToken = c.req.query('nextToken');
  const result = await getS3().send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: S3_UPLOAD_PREFIX,
      ...(nextToken ? { ContinuationToken: nextToken } : {}),
    }),
  );

  const documents = (result.Contents ?? []).map((obj) => ({
    key: obj.Key ?? '',
    name: (obj.Key ?? '').slice(S3_UPLOAD_PREFIX.length),
    sizeBytes: obj.Size ?? 0,
    lastModified: obj.LastModified?.toISOString() ?? new Date().toISOString(),
  }));

  const response: Record<string, unknown> = { documents };
  if (result.NextContinuationToken) {
    response.nextToken = result.NextContinuationToken;
  }

  return jsonWithValidation(c, 'listKbDocuments', 200, response);
});

knowledgeBaseRouter.post('/documents/presign', async (c) => {
  const validationError = await validateRequest(c, 'presignKbDocument');
  if (validationError) return validationError;

  if (!isConfigured()) {
    return jsonWithValidation(c, 'presignKbDocument', 400, {
      error: 'Knowledge Base is not configured.',
    });
  }

  const body = await readJsonBody(c);
  const { fileName, contentType, sizeBytes } = body as {
    fileName: string;
    contentType: string;
    sizeBytes: number;
  };

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonWithValidation(c, 'presignKbDocument', 400, {
      error: `Content type not allowed: ${contentType}`,
    });
  }

  if (sizeBytes > MAX_DECLARED_SIZE_BYTES) {
    return jsonWithValidation(c, 'presignKbDocument', 400, {
      error: 'File size exceeds the 50 MB limit.',
    });
  }

  const safe = sanitizeFileName(fileName);
  const key = `${S3_UPLOAD_PREFIX}${uuidv7()}-${safe}`;
  const expiresAt = new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString();

  const { bucketName } = kbConfig();
  // ContentLength is intentionally omitted from the command to avoid browser
  // fetch compatibility issues with presigned PUT requests. The sizeBytes
  // above is best-effort declared-size validation only.
  const presignedUrl = await getSignedUrl(
    getS3(),
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS },
  );

  return jsonWithValidation(c, 'presignKbDocument', 200, {
    presignedUrl,
    key,
    expiresAt,
  });
});

knowledgeBaseRouter.delete('/documents', async (c) => {
  const key = c.req.query('key');

  if (!key || key.trim() === '') {
    return jsonWithValidation(c, 'deleteKbDocument', 400, {
      error: 'Missing required query parameter: key',
    });
  }

  if (!key.startsWith(S3_UPLOAD_PREFIX)) {
    return jsonWithValidation(c, 'deleteKbDocument', 404, {
      error: 'Document not found.',
    });
  }

  if (!isConfigured()) {
    return jsonWithValidation(c, 'deleteKbDocument', 400, {
      error: 'Knowledge Base is not configured.',
    });
  }

  const cfg = kbConfig();
  await getS3().send(new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: key }));

  // Attempt to trigger re-ingestion after delete to keep the KB index in sync.
  // This is best-effort: failure does not affect the 204 success response.
  if (cfg.dataSourceId) {
    const active = await hasActiveIngestionJob(cfg);
    if (!active) {
      getBedrockAgent()
        .send(
          new StartIngestionJobCommand({
            knowledgeBaseId: cfg.kbId,
            dataSourceId: cfg.dataSourceId,
          }),
        )
        .catch((err: unknown) => {
          console.warn(
            '[kb] auto-sync after delete failed, user may re-sync manually:',
            err,
          );
        });
    }
  }

  return new Response(null, { status: 204 });
});

knowledgeBaseRouter.get('/ingestion-jobs', async (c) => {
  if (!isConfigured()) {
    return jsonWithValidation(c, 'listKbIngestionJobs', 200, { jobs: [] });
  }

  const { kbId, dataSourceId } = kbConfig();
  const result = await getBedrockAgent().send(
    new ListIngestionJobsCommand({
      knowledgeBaseId: kbId,
      dataSourceId,
      maxResults: MAX_INGESTION_JOBS,
    }),
  );

  const jobs = (result.ingestionJobSummaries ?? []).map((job) => {
    const summary: Record<string, unknown> = {
      jobId: job.ingestionJobId ?? '',
      status: job.status ?? 'STOPPED',
      startedAt: job.startedAt?.toISOString() ?? new Date().toISOString(),
    };
    if (job.updatedAt) summary.completedAt = job.updatedAt.toISOString();
    if (job.statistics) summary.statistics = job.statistics;
    return summary;
  });

  return jsonWithValidation(c, 'listKbIngestionJobs', 200, { jobs });
});

knowledgeBaseRouter.post('/sync', async (c) => {
  if (!isConfigured()) {
    return jsonWithValidation(c, 'startKbSync', 400, {
      error: 'Knowledge Base is not configured.',
    });
  }

  const { kbId, dataSourceId } = kbConfig();

  const listResult = await getBedrockAgent().send(
    new ListIngestionJobsCommand({
      knowledgeBaseId: kbId,
      dataSourceId,
      maxResults: 5,
    }),
  );

  const activeJob = (listResult.ingestionJobSummaries ?? []).find((j) =>
    isActiveStatus(j.status),
  );
  if (activeJob) {
    return jsonWithValidation(c, 'startKbSync', 409, {
      error: 'An ingestion job is already in progress.',
    });
  }

  const startResult = await getBedrockAgent().send(
    new StartIngestionJobCommand({ knowledgeBaseId: kbId, dataSourceId }),
  );

  return jsonWithValidation(c, 'startKbSync', 200, {
    jobId: startResult.ingestionJob?.ingestionJobId ?? '',
    status: 'STARTING',
  });
});
