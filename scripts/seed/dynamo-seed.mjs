#!/usr/bin/env node
/**
 * Seed DynamoDB tables with sample data from data/app/.
 *
 * Usage:
 *   THREADS_TABLE_NAME=<threads> MESSAGES_TABLE_NAME=<messages> node scripts/seed/dynamo-seed.mjs
 *
 * Optional env:
 *   AWS_REGION       - defaults to ap-northeast-1
 *   AWS_ENDPOINT_URL - for DynamoDB Local (e.g. http://localhost:8000)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data/app');

const THREADS_TABLE = process.env.THREADS_TABLE_NAME;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME;

if (!THREADS_TABLE || !MESSAGES_TABLE) {
  console.error(
    'Error: THREADS_TABLE_NAME and MESSAGES_TABLE_NAME environment variables must be set.',
  );
  process.exit(1);
}

const clientConfig = {
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
};

if (process.env.AWS_ENDPOINT_URL) {
  clientConfig.endpoint = process.env.AWS_ENDPOINT_URL;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));

async function loadJson(filename) {
  const raw = await readFile(join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(raw);
}

async function batchWrite(tableName, items) {
  // DynamoDB BatchWriteCommand supports up to 25 items per call
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({ PutRequest: { Item: item } })),
        },
      }),
    );
  }
}

async function main() {
  const [threads, messages] = await Promise.all([
    loadJson('chat-threads.json'),
    loadJson('chat-messages.json'),
  ]);

  // Transform threads: snake_case → camelCase, add userId for GSI
  const threadItems = threads.map((t) => ({
    threadId: t.thread_id,
    userId: t.user_id,
    title: t.title,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    // Derive preview from the last assistant message in seed data
  }));

  // Attach preview from last assistant message per thread
  for (const threadItem of threadItems) {
    const threadMessages = messages.filter((m) => m.thread_id === threadItem.threadId);
    const lastAssistant = threadMessages.filter((m) => m.role === 'assistant').at(-1);
    if (lastAssistant) {
      threadItem.preview = lastAssistant.content;
    }
  }

  // Transform messages: snake_case → camelCase, build composite SK
  const messageItems = messages.map((m) => ({
    threadId: m.thread_id,
    sk: `${m.created_at}#${m.message_id}`,
    messageId: m.message_id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
  }));

  console.log(`Seeding ${threadItems.length} thread(s) into "${THREADS_TABLE}"...`);
  await batchWrite(THREADS_TABLE, threadItems);

  console.log(`Seeding ${messageItems.length} message(s) into "${MESSAGES_TABLE}"...`);
  await batchWrite(MESSAGES_TABLE, messageItems);

  console.log('Done.');
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
