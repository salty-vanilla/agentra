import {
  chatStreamEventSchema,
  createThreadRequestSchema,
  healthResponseSchema,
  threadMessagesResponseSchema,
  threadResponseSchema,
  threadsResponseSchema,
  updateThreadRequestSchema,
} from '@agentra/shared';
import { app } from './app.js';

async function assertJsonResponse<T>(
  label: string,
  response: Response,
  expectedStatus: number,
  parser: (value: unknown) => T,
) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label}: expected status ${expectedStatus}, received ${response.status}`,
    );
  }

  const payload = await response.json();
  parser(payload);
}

async function assertChatStreamResponse(
  label: string,
  response: Response,
  expectedStatus: number,
) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label}: expected status ${expectedStatus}, received ${response.status}`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error(
      `${label}: expected text/event-stream content-type, received "${contentType}"`,
    );
  }

  const body = await response.text();
  const events = body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line.length > 0);

  if (events.length === 0) {
    throw new Error(`${label}: no SSE data events found`);
  }

  let sawDone = false;
  let sawError = false;
  for (const raw of events) {
    const parsed = JSON.parse(raw) as unknown;
    const event = chatStreamEventSchema.parse(parsed);
    if (event.type === 'done') {
      sawDone = true;
    }
    if (event.type === 'error') {
      sawError = true;
    }
  }

  if (!sawDone && !sawError) {
    throw new Error(`${label}: stream completed without done or error event`);
  }
}

async function main() {
  process.env.SKIP_AUTH = 'true';

  await assertJsonResponse(
    'GET /health',
    await app.request('/health'),
    200,
    healthResponseSchema.parse,
  );

  await assertJsonResponse(
    'GET /threads',
    await app.request('/threads'),
    200,
    threadsResponseSchema.parse,
  );

  await assertJsonResponse(
    'GET /threads/:threadId',
    await app.request('/threads/thread-demo-001'),
    200,
    threadResponseSchema.parse,
  );

  await assertJsonResponse(
    'GET /threads/:threadId/messages',
    await app.request('/threads/thread-demo-001/messages'),
    200,
    threadMessagesResponseSchema.parse,
  );

  await assertChatStreamResponse(
    'POST /chat',
    await app.request('/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: 'contract check',
        history: [],
      }),
    }),
    200,
  );

  const createdThreadResponse = await app.request('/threads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      createThreadRequestSchema.parse({ title: 'contract created thread' }),
    ),
  });
  if (createdThreadResponse.status !== 201) {
    throw new Error(
      `POST /threads: expected status 201, received ${createdThreadResponse.status}`,
    );
  }
  const createdPayload = threadResponseSchema.parse(await createdThreadResponse.json());
  const createdThreadId = createdPayload.thread.threadId as string;

  await assertJsonResponse(
    'PATCH /threads/:threadId',
    await app.request(`/threads/${createdThreadId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        updateThreadRequestSchema.parse({ title: 'updated thread title' }),
      ),
    }),
    200,
    threadResponseSchema.parse,
  );

  const deleteResponse = await app.request(`/threads/${createdThreadId}`, {
    method: 'DELETE',
  });
  await assertJsonResponse(
    'DELETE /threads/:threadId',
    deleteResponse,
    200,
    threadResponseSchema.parse,
  );

  const deletedMessageResponse = await app.request(
    `/threads/${createdThreadId}/messages`,
  );
  if (deletedMessageResponse.status !== 404) {
    throw new Error(
      `GET /threads/${createdThreadId}/messages after delete: expected status 404, received ${deletedMessageResponse.status}`,
    );
  }

  const missingThreadResponse = await app.request('/threads/not-found');
  if (missingThreadResponse.status !== 404) {
    throw new Error(
      `GET /threads/not-found: expected status 404, received ${missingThreadResponse.status}`,
    );
  }

  const invalidChatResponse = await app.request('/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: '',
    }),
  });

  if (invalidChatResponse.status !== 400) {
    throw new Error(
      `POST /chat invalid request: expected status 400, received ${invalidChatResponse.status}`,
    );
  }

  const missingThreadChatResponse = await app.request('/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: 'should fail',
      threadId: 'thread-not-found',
    }),
  });
  if (missingThreadChatResponse.status !== 404) {
    throw new Error(
      `POST /chat with missing threadId: expected status 404, received ${missingThreadChatResponse.status}`,
    );
  }

  const invalidPatchResponse = await app.request('/threads/thread-demo-001', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: '',
    }),
  });
  if (invalidPatchResponse.status !== 400) {
    throw new Error(
      `PATCH /threads/:threadId invalid request: expected status 400, received ${invalidPatchResponse.status}`,
    );
  }

  console.log('Backend contract smoke checks passed.');
}

await main();
