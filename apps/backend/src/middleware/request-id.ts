import type { MiddlewareHandler } from 'hono';
import { uuidv7 } from 'uuidv7';

// biome-ignore lint/suspicious/noExplicitAny: Hono generic variables differ per app instance
export const requestIdMiddleware: MiddlewareHandler<any> = async (c, next) => {
  // Extract x-request-id from request headers (case-insensitive)
  // If not present, generate a new one
  const requestIdHeader = c.req.header('x-request-id') || c.req.header('X-Request-ID');
  const requestId = requestIdHeader?.trim() || uuidv7();

  // Store in context for downstream use
  c.set('requestId', requestId);

  // Process the next middleware/handler
  await next();

  // Add to response headers for client tracking
  c.header('x-request-id', requestId);
};
