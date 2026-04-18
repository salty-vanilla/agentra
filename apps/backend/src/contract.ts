import {
  chatResponseSchema,
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
    throw new Error(`${label}: expected status ${expectedStatus}, received ${response.status}`);
  }

  const payload = await response.json();
  parser(payload);
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

  await assertJsonResponse(
    'POST /chat',
    await app.request('/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: 'contract check',
        history: [],
      }),
    }),
    200,
    chatResponseSchema.parse,
  );

  const createdThreadResponse = await app.request('/threads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(createThreadRequestSchema.parse({ title: 'contract created thread' })),
  });
  if (createdThreadResponse.status !== 201) {
    throw new Error(`POST /threads: expected status 201, received ${createdThreadResponse.status}`);
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
      body: JSON.stringify(updateThreadRequestSchema.parse({ title: 'updated thread title' })),
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

  const deletedMessageResponse = await app.request(`/threads/${createdThreadId}/messages`);
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
