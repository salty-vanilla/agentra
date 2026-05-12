import { startBackendServer } from './server.js';

startBackendServer({
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8080),
});
