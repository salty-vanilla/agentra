import {
  type ChatObservationSummary,
  type PersistedChatMessage,
  persistedChatMessageSchema,
  type ThreadSummary,
  threadSummarySchema,
} from '@agentra/shared';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { uuidv7 } from 'uuidv7';
import type { CreateThreadInput, Store } from './index.js';

function getThreadsTable(): string {
  const name = process.env.THREADS_TABLE_NAME;
  if (!name) throw new Error('THREADS_TABLE_NAME environment variable is not set');
  return name;
}

function getMessagesTable(): string {
  const name = process.env.MESSAGES_TABLE_NAME;
  if (!name) throw new Error('MESSAGES_TABLE_NAME environment variable is not set');
  return name;
}

function buildSk(createdAt: string, messageId: string): string {
  return `${createdAt}#${messageId}`;
}

function buildThreadTitle(title?: string, fallbackMessage?: string): string {
  if (title?.trim()) {
    return title.trim();
  }

  if (fallbackMessage?.trim()) {
    return fallbackMessage.trim().slice(0, 40);
  }

  return 'New Chat';
}

function toThreadSummary(item: Record<string, unknown>): ThreadSummary {
  return threadSummarySchema.parse(item);
}

function toPersistedChatMessage(item: Record<string, unknown>): PersistedChatMessage {
  return persistedChatMessageSchema.parse(item);
}

export class DynamoStore implements Store {
  private client: DynamoDBDocumentClient;

  constructor() {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: {
        // Observability payloads can include optional undefined fields.
        // Strip them so Put/Update calls remain compatible with Dynamo marshalling.
        removeUndefinedValues: true,
      },
    });
  }

  async listThreads(userId: string): Promise<ThreadSummary[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: getThreadsTable(),
        IndexName: 'userId-updatedAt-index',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ScanIndexForward: false,
      }),
    );

    return (result.Items ?? []).map((item) =>
      toThreadSummary(item as Record<string, unknown>),
    );
  }

  async getThread(threadId: string, userId: string): Promise<ThreadSummary | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: getThreadsTable(),
        Key: { threadId },
      }),
    );

    if (!result.Item || result.Item.userId !== userId) return undefined;
    return toThreadSummary(result.Item as Record<string, unknown>);
  }

  async getThreadMessages(threadId: string): Promise<PersistedChatMessage[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: getMessagesTable(),
        KeyConditionExpression: 'threadId = :tid',
        ExpressionAttributeValues: { ':tid': threadId },
        ScanIndexForward: true,
      }),
    );

    return (result.Items ?? []).map((item) =>
      toPersistedChatMessage(item as Record<string, unknown>),
    );
  }

  async createThread(input: CreateThreadInput): Promise<ThreadSummary> {
    const timestamp = new Date().toISOString();
    const threadId = uuidv7();
    const thread: ThreadSummary = {
      threadId,
      title: buildThreadTitle(input.title, input.initialMessage),
      createdAt: timestamp,
      updatedAt: timestamp,
      preview: input.initialMessage,
    };

    await this.client.send(
      new PutCommand({
        TableName: getThreadsTable(),
        Item: {
          ...thread,
          userId: input.userId,
        },
      }),
    );

    return thread;
  }

  async updateThreadTitle(input: {
    threadId: string;
    userId: string;
    title: string;
  }): Promise<ThreadSummary | undefined> {
    try {
      const result = await this.client.send(
        new UpdateCommand({
          TableName: getThreadsTable(),
          Key: { threadId: input.threadId },
          UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
          ConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':title': input.title.trim(),
            ':updatedAt': new Date().toISOString(),
            ':userId': input.userId,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      if (!result.Attributes) {
        return undefined;
      }

      return toThreadSummary(result.Attributes as Record<string, unknown>);
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
        return undefined;
      }
      throw error;
    }
  }

  async deleteThread(input: {
    threadId: string;
    userId: string;
  }): Promise<ThreadSummary | undefined> {
    const existingThread = await this.getThread(input.threadId, input.userId);
    if (!existingThread) {
      return undefined;
    }

    const messageKeys = await this.collectMessageKeys(input.threadId);
    await this.deleteMessagesByKeys(messageKeys);

    await this.client.send(
      new DeleteCommand({
        TableName: getThreadsTable(),
        Key: { threadId: input.threadId },
        ConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': input.userId,
        },
      }),
    );

    return existingThread;
  }

  async appendMessage(input: {
    threadId: string;
    role: 'user' | 'assistant';
    content: string;
    observabilitySummary?: ChatObservationSummary;
  }): Promise<PersistedChatMessage> {
    const timestamp = new Date().toISOString();
    const messageId = uuidv7();
    const message: PersistedChatMessage = {
      messageId,
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: timestamp,
      ...(input.observabilitySummary
        ? { observabilitySummary: input.observabilitySummary }
        : {}),
    };

    await this.client.send(
      new PutCommand({
        TableName: getMessagesTable(),
        Item: {
          threadId: input.threadId,
          sk: buildSk(timestamp, messageId),
          messageId,
          role: input.role,
          content: input.content,
          createdAt: timestamp,
          ...(input.observabilitySummary
            ? { observabilitySummary: input.observabilitySummary }
            : {}),
        },
      }),
    );

    // Always update updatedAt and preview on the thread
    await this.client.send(
      new UpdateCommand({
        TableName: getThreadsTable(),
        Key: { threadId: input.threadId },
        UpdateExpression: 'SET updatedAt = :updatedAt, preview = :preview',
        ExpressionAttributeValues: {
          ':updatedAt': timestamp,
          ':preview': input.content,
        },
      }),
    );

    // Conditionally update title when still default 'New Chat'
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: getThreadsTable(),
          Key: { threadId: input.threadId },
          UpdateExpression: 'SET title = :title',
          ConditionExpression: 'title = :defaultTitle',
          ExpressionAttributeValues: {
            ':title': buildThreadTitle(undefined, input.content),
            ':defaultTitle': 'New Chat',
          },
        }),
      );
    } catch (error: unknown) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') {
        throw error;
      }
    }

    return message;
  }

  private async collectMessageKeys(threadId: string) {
    const keys: Array<{ threadId: string; sk: string }> = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: getMessagesTable(),
          KeyConditionExpression: 'threadId = :tid',
          ExpressionAttributeValues: { ':tid': threadId },
          ProjectionExpression: 'threadId, sk',
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );

      for (const item of result.Items ?? []) {
        const typed = item as { threadId?: string; sk?: string };
        if (typed.threadId && typed.sk) {
          keys.push({ threadId: typed.threadId, sk: typed.sk });
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return keys;
  }

  private async deleteMessagesByKeys(keys: Array<{ threadId: string; sk: string }>) {
    if (keys.length === 0) {
      return;
    }

    const chunks: Array<Array<{ threadId: string; sk: string }>> = [];
    for (let index = 0; index < keys.length; index += 25) {
      chunks.push(keys.slice(index, index + 25));
    }

    for (const chunk of chunks) {
      await this.client.send(
        new BatchWriteCommand({
          RequestItems: {
            [getMessagesTable()]: chunk.map((key) => ({
              DeleteRequest: {
                Key: key,
              },
            })),
          },
        }),
      );
    }
  }
}
