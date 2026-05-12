import { serve } from '@hono/node-server';
import { app } from './app.js';

export type StartBackendServerOptions = {
  host?: string;
  port?: number;
};

export function startBackendServer(options: StartBackendServerOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;

  console.log(`Agentra backend listening on http://${host}:${port}`);

  return serve({
    fetch: app.fetch,
    hostname: host,
    port,
  });
}
