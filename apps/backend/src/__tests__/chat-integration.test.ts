import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { chatStreamEventSchema } from '../lib/chat-stream.js';

function parseSseBody(body: string): Array<{ type: string; [key: string]: unknown }> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown)
    .map((raw) => {
      const result = chatStreamEventSchema.safeParse(raw);
      if (!result.success) {
        throw new Error(`Invalid event: ${result.error}`);
      }
      return result.data;
    });
}

describe('POST /chat - integration tests', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
    process.env.STORE_TYPE = 'memory';
  });

  describe('request ID middleware integration', () => {
    it('generates requestId when not provided in header', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      const requestId = response.headers.get('x-request-id');
      expect(requestId).toBeTruthy();
      expect(typeof requestId).toBe('string');
    });

    it('preserves x-request-id from request header', async () => {
      const existingId = 'custom-request-id-123';
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': existingId,
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('x-request-id')).toBe(existingId);
    });

    it('includes requestId in SSE error event when runtime unavailable', async () => {
      const requestId = 'error-tracking-id';
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent as any).requestId).toBe(requestId);
    });

    it('sets x-request-id header on response', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'test-id-for-header',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.has('x-request-id')).toBe(true);
    });

    it('generates unique requestIds for concurrent requests', async () => {
      const ids: string[] = [];

      for (let i = 0; i < 3; i++) {
        const response = await app.request('/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: `test ${i}`,
          }),
        });

        const requestId = response.headers.get('x-request-id');
        expect(requestId).toBeTruthy();
        ids.push(requestId!);
      }

      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('error handling and sanitization', () => {
    it('returns 404 for non-existent thread', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
          threadId: 'non-existent-thread-id-xyz',
        }),
      });

      expect(response.status).toBe(404);
    });

    it('returns 400 for empty message', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: '',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('emits valid terminal event (done or error)', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const hasTerminal = events.some((e) => e.type === 'done' || e.type === 'error');
      expect(hasTerminal).toBe(true);
    });

    it('emits thread_started event before error', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test message',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const threadStartedEvent = events.find((e) => e.type === 'thread_started');
      expect(threadStartedEvent).toBeDefined();
      expect((threadStartedEvent as any).threadId).toBeTruthy();
    });

    it('emits thread_started and error event', async () => {
      const userMessage = 'test user message for error path';
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const threadStartedEvent = events.find((e) => e.type === 'thread_started');
      expect(threadStartedEvent).toBeDefined();
      expect((threadStartedEvent as any)?.threadId).toBeTruthy();

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
    });
  });

  describe('error event structure', () => {
    it('error event includes requestId', async () => {
      const requestId = 'error-request-id';
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent as any).requestId).toBe(requestId);
    });

    it('error event includes observabilitySummary with error status', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();

      const obs = (errorEvent as any).observabilitySummary;
      expect(obs).toBeDefined();
      expect(obs.status).toBe('error');
      expect(obs.traceId).toBeTruthy();
    });

    it('error event includes sanitized error message', async () => {
      const requestId = 'error-message-id';
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          message: 'test message',
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.text();
      const events = parseSseBody(body);

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent as any).requestId).toBe(requestId);
      expect((errorEvent as any).error).toBeTruthy();
      expect(typeof (errorEvent as any).error).toBe('string');
    });
  });

  describe('content type validation', () => {
    it('accepts application/json content-type', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
    });

    it('returns text/event-stream as content-type', async () => {
      const response = await app.request('/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'test',
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
    });
  });
});
