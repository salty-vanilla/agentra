import { serve } from '@hono/node-server';
import { app } from './app.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);

console.log(`Agentra backend listening on http://${host}:${port}`);

serve({
  fetch: app.fetch,
  hostname: host,
  port,
});
