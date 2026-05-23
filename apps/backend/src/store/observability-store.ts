import { type ObservabilityRecord, observabilityRecordSchema } from '@agentra/shared';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

export type DateRangeOpts = {
  startDay?: string;
  endDay?: string;
};

export type PaginationOpts = {
  limit?: number;
  cursor?: string;
};

export type PagedObservabilityResult = {
  records: ObservabilityRecord[];
  cursor?: string;
};

export interface ObservabilityStore {
  putObservabilityRecord(record: ObservabilityRecord): Promise<void>;
  getObservabilityRecordByTraceId(
    traceId: string,
  ): Promise<ObservabilityRecord | undefined>;
  listObservabilityRecordsByUser(
    userId: string,
    range?: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult>;
  listObservabilityRecordsByDay(
    day: string,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult>;
}

// ── Memory implementation ─────────────────────────────────────────────────────

export class MemoryObservabilityStore implements ObservabilityStore {
  private records: ObservabilityRecord[] = [];

  async putObservabilityRecord(record: ObservabilityRecord): Promise<void> {
    this.records.push(record);
  }

  async getObservabilityRecordByTraceId(
    traceId: string,
  ): Promise<ObservabilityRecord | undefined> {
    return this.records.find((r) => r.traceId === traceId);
  }

  async listObservabilityRecordsByUser(
    userId: string,
    range?: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    let filtered = this.records.filter((r) => r.userId === userId);

    const startDay = range?.startDay;
    if (startDay) {
      filtered = filtered.filter((r) => r.startedAt.slice(0, 10) >= startDay);
    }
    const endDay = range?.endDay;
    if (endDay) {
      filtered = filtered.filter((r) => r.startedAt.slice(0, 10) <= endDay);
    }

    filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const limit = pagination?.limit ?? 50;
    const offset = pagination?.cursor
      ? Number(Buffer.from(pagination.cursor, 'base64').toString())
      : 0;
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const cursor =
      nextOffset < filtered.length
        ? Buffer.from(String(nextOffset)).toString('base64')
        : undefined;

    return { records: page, ...(cursor ? { cursor } : {}) };
  }

  async listObservabilityRecordsByDay(
    day: string,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const filtered = this.records.filter((r) => r.startedAt.startsWith(day));
    filtered.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const limit = pagination?.limit ?? 50;
    const offset = pagination?.cursor
      ? Number(Buffer.from(pagination.cursor, 'base64').toString())
      : 0;
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const cursor =
      nextOffset < filtered.length
        ? Buffer.from(String(nextOffset)).toString('base64')
        : undefined;

    return { records: page, ...(cursor ? { cursor } : {}) };
  }
}

// ── DynamoDB implementation ───────────────────────────────────────────────────

function getObservabilityTable(): string {
  const name = process.env.OBSERVABILITY_TABLE_NAME;
  if (!name) throw new Error('OBSERVABILITY_TABLE_NAME environment variable is not set');
  return name;
}

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64').toString()) as Record<string, unknown>;
}

function toRecord(item: Record<string, unknown>): ObservabilityRecord {
  return observabilityRecordSchema.parse(item);
}

export class DynamoObservabilityStore implements ObservabilityStore {
  private client: DynamoDBDocumentClient;

  constructor() {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async putObservabilityRecord(record: ObservabilityRecord): Promise<void> {
    const day = record.startedAt.slice(0, 10);

    await this.client.send(
      new PutCommand({
        TableName: getObservabilityTable(),
        Item: {
          ...record,
          pk: `USER#${record.userId}`,
          sk: `${record.startedAt}#${record.traceId}`,
          gsi1pk: `TRACE#${record.traceId}`,
          gsi1sk: 'RECORD',
          gsi2pk: `DAY#${day}`,
          gsi2sk: `${record.startedAt}#USER#${record.userId}`,
          gsi3pk: `THREAD#${record.threadId}`,
          gsi3sk: `${record.startedAt}#${record.traceId}`,
        },
      }),
    );
  }

  async getObservabilityRecordByTraceId(
    traceId: string,
  ): Promise<ObservabilityRecord | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: getObservabilityTable(),
        IndexName: 'gsi1-index',
        KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk = :sk',
        ExpressionAttributeValues: {
          ':pk': `TRACE#${traceId}`,
          ':sk': 'RECORD',
        },
        Limit: 1,
      }),
    );

    const item = result.Items?.[0];
    if (!item) return undefined;
    return toRecord(item as Record<string, unknown>);
  }

  async listObservabilityRecordsByUser(
    userId: string,
    range?: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const limit = pagination?.limit ?? 50;

    let keyCondition = 'pk = :pk';
    const expressionValues: Record<string, unknown> = { ':pk': `USER#${userId}` };

    if (range?.startDay && range?.endDay) {
      keyCondition += ' AND sk BETWEEN :start AND :end';
      expressionValues[':start'] = range.startDay;
      expressionValues[':end'] = `${range.endDay}T99:99:99.999Z`;
    } else if (range?.startDay) {
      keyCondition += ' AND sk >= :start';
      expressionValues[':start'] = range.startDay;
    } else if (range?.endDay) {
      keyCondition += ' AND sk <= :end';
      expressionValues[':end'] = `${range.endDay}T99:99:99.999Z`;
    }

    const result = await this.client.send(
      new QueryCommand({
        TableName: getObservabilityTable(),
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        ScanIndexForward: false,
        Limit: limit,
        ...(pagination?.cursor
          ? { ExclusiveStartKey: decodeCursor(pagination.cursor) }
          : {}),
      }),
    );

    const records = (result.Items ?? []).map((item) =>
      toRecord(item as Record<string, unknown>),
    );

    const cursor = result.LastEvaluatedKey
      ? encodeCursor(result.LastEvaluatedKey as Record<string, unknown>)
      : undefined;

    return { records, ...(cursor ? { cursor } : {}) };
  }

  async listObservabilityRecordsByDay(
    day: string,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const limit = pagination?.limit ?? 50;

    const result = await this.client.send(
      new QueryCommand({
        TableName: getObservabilityTable(),
        IndexName: 'gsi2-index',
        KeyConditionExpression: 'gsi2pk = :pk',
        ExpressionAttributeValues: { ':pk': `DAY#${day}` },
        ScanIndexForward: false,
        Limit: limit,
        ...(pagination?.cursor
          ? { ExclusiveStartKey: decodeCursor(pagination.cursor) }
          : {}),
      }),
    );

    const records = (result.Items ?? []).map((item) =>
      toRecord(item as Record<string, unknown>),
    );

    const cursor = result.LastEvaluatedKey
      ? encodeCursor(result.LastEvaluatedKey as Record<string, unknown>)
      : undefined;

    return { records, ...(cursor ? { cursor } : {}) };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createObservabilityStore(): ObservabilityStore {
  if (process.env.STORE_TYPE === 'dynamo') {
    return new DynamoObservabilityStore();
  }
  return new MemoryObservabilityStore();
}

const activeObservabilityStore: ObservabilityStore = createObservabilityStore();

export const putObservabilityRecord = (record: ObservabilityRecord) =>
  activeObservabilityStore.putObservabilityRecord(record);

export const getObservabilityRecordByTraceId = (traceId: string) =>
  activeObservabilityStore.getObservabilityRecordByTraceId(traceId);

export const listObservabilityRecordsByUser = (
  userId: string,
  range?: DateRangeOpts,
  pagination?: PaginationOpts,
) => activeObservabilityStore.listObservabilityRecordsByUser(userId, range, pagination);

export const listObservabilityRecordsByDay = (day: string, pagination?: PaginationOpts) =>
  activeObservabilityStore.listObservabilityRecordsByDay(day, pagination);
