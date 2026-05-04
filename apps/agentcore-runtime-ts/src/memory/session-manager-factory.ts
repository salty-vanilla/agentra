import { SessionManager } from '@strands-agents/sdk';
import { resolveMemoryConfig } from './memory-config.js';

export type SessionManagerMode = 's3-session' | 'noop';

export interface RuntimeSessionManager {
  sessionManager?: SessionManager;
  mode: SessionManagerMode;
}

/**
 * Create a SessionManager for a single request.
 *
 * Returns `{ sessionManager, mode }`.
 * - If memory is enabled and S3 is configured, uses S3Storage.
 * - Otherwise returns noop (no session manager).
 *
 * The caller should pass `sessionManager` to Agent if defined.
 */
export async function createRuntimeSessionManager(input: {
  userId: string;
  threadId: string;
}): Promise<RuntimeSessionManager> {
  const config = resolveMemoryConfig();

  if (!config.enabled) {
    return { mode: 'noop' };
  }

  if (config.s3) {
    try {
      // Dynamic import to avoid loading S3 SDK when not needed
      const { S3Storage } = await import('@strands-agents/sdk/session/s3-storage');

      const storage = new S3Storage({
        bucket: config.s3.bucket,
        prefix: `${config.s3.prefix}/${input.userId}`,
        region: config.s3.region,
      });

      const sessionManager = new SessionManager({
        storage: { snapshot: storage },
        sessionId: input.threadId,
        saveLatestOn: 'invocation',
      });

      console.info('[memory] session_manager_created', {
        mode: 's3-session',
        threadId: input.threadId,
        bucket: config.s3.bucket,
      });

      return { sessionManager, mode: 's3-session' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[memory] session_manager_fallback_to_noop', {
        reason: message,
      });
      return { mode: 'noop' };
    }
  }

  return { mode: 'noop' };
}
