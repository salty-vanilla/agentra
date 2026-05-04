/**
 * Memory / session configuration resolved from environment variables.
 */

export interface MemoryConfig {
  enabled: boolean;
  s3: {
    bucket: string;
    prefix: string;
    region: string;
  } | null;
}

export function resolveMemoryConfig(): MemoryConfig {
  const enabled = process.env.AGENT_MEMORY_ENABLED === 'true';

  if (!enabled) {
    return { enabled: false, s3: null };
  }

  const bucket = process.env.AGENT_SESSION_S3_BUCKET?.trim();
  if (!bucket) {
    return { enabled: true, s3: null };
  }

  return {
    enabled: true,
    s3: {
      bucket,
      prefix: process.env.AGENT_SESSION_S3_PREFIX?.trim() || 'sessions',
      region:
        process.env.AGENT_SESSION_S3_REGION?.trim() ||
        process.env.AWS_REGION ||
        'us-east-1',
    },
  };
}
