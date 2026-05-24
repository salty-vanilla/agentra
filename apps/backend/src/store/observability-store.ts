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
  listObservabilityRecordsInRange(
    range: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult>;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function applyOffsetPagination(
  sorted: ObservabilityRecord[],
  pagination?: PaginationOpts,
): PagedObservabilityResult {
  const limit = pagination?.limit ?? 50;
  const offset = pagination?.cursor
    ? Number(Buffer.from(pagination.cursor, 'base64').toString())
    : 0;
  const page = sorted.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const cursor =
    nextOffset < sorted.length
      ? Buffer.from(String(nextOffset)).toString('base64')
      : undefined;
  return { records: page, ...(cursor ? { cursor } : {}) };
}

function filterByRange(
  records: ObservabilityRecord[],
  range: DateRangeOpts,
): ObservabilityRecord[] {
  let filtered = records;
  if (range.startDay) {
    filtered = filtered.filter(
      (r) => r.startedAt.slice(0, 10) >= (range.startDay as string),
    );
  }
  if (range.endDay) {
    filtered = filtered.filter(
      (r) => r.startedAt.slice(0, 10) <= (range.endDay as string),
    );
  }
  return filtered;
}

// ── Memory implementation ─────────────────────────────────────────────────────

export class MemoryObservabilityStore implements ObservabilityStore {
  records: ObservabilityRecord[] = [];

  async putObservabilityRecord(record: ObservabilityRecord): Promise<void> {
    this.records = [...this.records, record];
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
    if (range) filtered = filterByRange(filtered, range);
    const sorted = [...filtered].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return applyOffsetPagination(sorted, pagination);
  }

  async listObservabilityRecordsByDay(
    day: string,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const filtered = this.records.filter((r) => r.startedAt.startsWith(day));
    const sorted = [...filtered].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return applyOffsetPagination(sorted, pagination);
  }

  async listObservabilityRecordsInRange(
    range: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const filtered = filterByRange(this.records, range);
    const sorted = [...filtered].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return applyOffsetPagination(sorted, pagination);
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

function iterateDays(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  const current = new Date(`${startDay}T00:00:00Z`);
  const end = new Date(`${endDay}T00:00:00Z`);
  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
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

  async listObservabilityRecordsInRange(
    range: DateRangeOpts,
    pagination?: PaginationOpts,
  ): Promise<PagedObservabilityResult> {
    const today = new Date().toISOString().slice(0, 10);
    const startDay = range.startDay ?? today;
    const endDay = range.endDay ?? today;

    const days = iterateDays(startDay, endDay);

    // Collect all records across days using GSI2 (acceptable at demo scale)
    const allRecords: ObservabilityRecord[] = [];
    for (const day of days) {
      let cursor: string | undefined;
      do {
        const result = await this.listObservabilityRecordsByDay(
          day,
          cursor !== undefined ? { limit: 1000, cursor } : { limit: 1000 },
        );
        allRecords.push(...result.records);
        cursor = result.cursor;
      } while (cursor);
    }

    const sorted = allRecords.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return applyOffsetPagination(sorted, pagination);
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

export const listObservabilityRecordsInRange = (
  range: DateRangeOpts,
  pagination?: PaginationOpts,
) => activeObservabilityStore.listObservabilityRecordsInRange(range, pagination);

export function resetObservabilityStore(): void {
  if (activeObservabilityStore instanceof MemoryObservabilityStore) {
    activeObservabilityStore.records = [];
  }
}
