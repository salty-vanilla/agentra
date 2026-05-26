#!/usr/bin/env tsx
/**
 * Live BFF /chat SSE smoke script.
 *
 * Calls the deployed BFF HTTP API (via API Gateway + Lambda Web Adapter) and
 * verifies the SSE stream reaches the Streaming API endpoint. Use this to
 * confirm end-to-end transport before investigating runtime issues.
 *
 * Usage:
 *   # With env file generated from CDK outputs:
 *   just outputs-env <stage> bff-smoke
 *   just smoke-bff-chat <stage> <profile>
 *
 *   # Direct (auth required in production):
 *   AGENTRA_STREAMING_API_BASE_URL=https://... \
 *   AGENTRA_AUTH_TOKEN=<cognito-id-token> \
 *   pnpm --filter @agentra/backend exec tsx scripts/smoke-bff-chat.ts
 *
 * Env vars:
 *   AGENTRA_STREAMING_API_BASE_URL  (required) streaming API base URL
 *   AGENTRA_AUTH_TOKEN              (required for auth-enabled envs)
 *   SMOKE_PROMPT                    (default: built-in greeting)
 *   SMOKE_THREAD_ID                 (optional, reuse an existing thread)
 *   SMOKE_TIMEOUT_MS                (default: 300000)
 *
 * Exit codes:
 *   0 — all required events received and requestId/traceId present
 *   1 — smoke failed (error event, timeout, missing fields, or network error)
 */

import { readBffSmokeConfig, runBffSmoke } from './smoke-bff-chat-core.js';

async function main(): Promise<void> {
  const config = readBffSmokeConfig();
  await runBffSmoke(config);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
